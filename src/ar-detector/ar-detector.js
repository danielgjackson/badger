// ArDetector
// Dan Jackson
//
// Finds AR Toolkit markers in an image
// 
// Uses: https://github.com/artoolkitx/jsartoolkit5
// and:  https://github.com/mrdoob/three.js
//

function relativePath(rawUrl) {
    // Full URL, relative to this script
    let relativePath = (new URL(rawUrl, import.meta.url)).toString();
    // Remove the page URL as a base
    const base = window.location.toString();
    if (relativePath.startsWith(base)) {
        relativePath = relativePath.substring(base.length);
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        relativePath = './' + relativePath;
    }
    return relativePath;
}

// Asynchronously load a script
async function loadScript(rawUrl) {
  return new Promise((resolve, reject) => {
    const scriptFile = relativePath(rawUrl);
    console.log("SCRIPT: Load: " + rawUrl + " -> " + scriptFile);
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptFile;
    script.async = true;
    script.onload = (res) => { resolve(res); }
    script.onerror = (err) => { reject(new Error(err)); }
    document.querySelector('head').appendChild(script);
  });
}

export class ArDetector {

    constructor(options) {
        this.options = Object.assign({
            // no defaults
        }, options);

        this.arScene = null;
        this.arController = null;
        this.arCamera = null;

        this.frameNumber = 0;

        this.processCallback = null;
        this.markerCallback = null;
        this.multiMarkerCallback = null;

        // Begin async startup
        if (!ArDetector.startupPromise) {
            ArDetector.startupPromise = new Promise((resolve, reject) => {
                ArDetector.startupResolve = resolve;
                ArDetector.startupReject = reject;
            });
            ArDetector._startup();
        }
    }

    static async _startup() {
        // Initialize
        try {
            console.log('ARDETECTOR: startup...');

            // Load external scripts
            await loadScript('./depends/three.js/three.min.js');
            await loadScript('./depends/artoolkit/artoolkit.api.js');
            await loadScript('./depends/artoolkit/artoolkit.min.js');
            await loadScript('./depends/artoolkit/artoolkit.three.js');

            // Only finished when ARThree is ready
            await new Promise((resolve) => {
                // Finished immediately if ARThree already loaded
                if (window.ARController && window.ARController.getUserMediaThreeScene) {
                    //console.log("ARDETECTOR: ARThree was already loaded");
                    resolve();
                } else {
                    //console.log("ARDETECTOR: ARThree was not already loaded.");
                    // Fires when ARThree loads
                    window.ARThreeOnLoad = () => {
                        //console.log("ARDETECTOR: ARThree finished loading");
                        resolve();
                    }
                }
            });

            console.log('ARDETECTOR: startup done.');
            ArDetector.startupResolve();
        } catch (e) {
            ArDetector.startupReject(e);
        }
    }

    // Create getUserMedia Three scene
    async createMediaScene(maxARVideoSize, rawCameraParam) {
        await ArDetector.startupPromise;
        const cameraParam = relativePath(rawCameraParam);
        console.log("ARDETECTOR: createMediaScene()");
        return new Promise((resolve, reject) => {
            window.ARController.getUserMediaThreeScene({
                maxARVideoSize: maxARVideoSize, // 640,
                cameraParam: cameraParam, // '/data/camera_para.dat', // 'data/camera_para.dat' 'data/camera_para-iPhone 5 rear 640x480 1.0m.dat'
                onSuccess: (arScene, arController, arCamera) => {
                    console.log("ARDETECTOR: getUserMediaThreeScene() successful.");
                    this.arScene = arScene;
                    this.arController = arController;
                    this.arCamera = arCamera;
                    resolve({ arScene, arController, arCamera });
                },
                onError: (err) => { reject(new Error(err)); }
            });
        });
    }

    // Create renderer
    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        document.body.className = this.arController.orientation;
        if (this.arController.orientation === 'portrait') {
            let w = (window.innerWidth / this.arController.videoHeight) * this.arController.videoWidth;
            let h = window.innerWidth;
            this.renderer.setSize(w, h);
            this.renderer.domElement.style.paddingBottom = (w-h) + 'px';
        } else {
            if (/Android|mobile|iPad|iPhone/i.test(navigator.userAgent)) {
                this.renderer.setSize(window.innerWidth, (window.innerWidth / this.arController.videoWidth) * this.arController.videoHeight);
            } else {
                this.renderer.setSize(this.arController.videoWidth, this.arController.videoHeight);
                document.body.className += ' desktop';
            }
        }
        document.body.insertBefore(this.renderer.domElement, document.body.firstChild);
        window.onclick = () => {
            this.arScene.video.play();      // click-to-play video
        };
    }


    // Set detection mode
    setDetectionMode(usePattern, matrix) {
        let detectionMode = artoolkit.AR_MATRIX_CODE_DETECTION;
        const detectionModes = {
            'color': artoolkit.AR_TEMPLATE_MATCHING_COLOR,  // base API's default
            'mono': artoolkit.AR_TEMPLATE_MATCHING_MONO,
            'matrix': artoolkit.AR_MATRIX_CODE_DETECTION,
            'color_and_matrix': artoolkit.AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX,
            'mono_and_matrix': artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_MATRIX,
            // Original API 'usePattern'
            true: artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_MATRIX,
        };
        if (usePattern) {
            if (!(usePattern in detectionModes)) {
                throw new Error('ARDETECTOR: setDetectionMode: unknown detection mode "' + usePattern + '"');
            }
            detectionMode = detectionModes[usePattern];
        }
        this.arController.setPatternDetectionMode(detectionMode);

        // Matrix code type
        let matrixCodeType = artoolkit.AR_MATRIX_CODE_3x3;
        // Marker information: https://github.com/artoolkitx/artoolkitx/wiki/Creating-and-using-square-barcode-markers
        // Marker generation tool: https://au.gmented.com/app/marker/marker.php
        const matrixCodeTypes = {
            '3x3': artoolkit.AR_MATRIX_CODE_3x3,                        //   64 markers, 0-bit error detection, 0-bit error correction
            '3x3_hamming63': artoolkit.AR_MATRIX_CODE_3x3_HAMMING63,    //    8 markers, 2-bit error detection, 1-bit error correction
            '3x3_parity65': artoolkit.AR_MATRIX_CODE_3x3_PARITY65,      //   32 markers, 1-bit error detection, 0-bit error correction
            '4x4': artoolkit.AR_MATRIX_CODE_4x4,                        // 8192 markers, 0-bit error detection, 0-bit error correction
            '4x4_bch_13_9_3': artoolkit.AR_MATRIX_CODE_4x4_BCH_13_9_3,  //  512 markers, 2-bit error detection, 1-bit error correction
            '4x4_bch_13_5_5': artoolkit.AR_MATRIX_CODE_4x4_BCH_13_5_5,  //   32 markers, 4-bit error detection, 2-bit error correction
        }
        if (matrix) {
            if (!(matrix in matrixCodeTypes)) {
                throw new Error('ARDETECTOR: setDetectionMode: unknown matrix code type "' + matrix + '"');
            }
            matrixCodeType = matrixCodeTypes[matrix];
        }
        this.arController.setMatrixCodeType(matrixCodeType);
    }
    

    // Start tracking barcode marker
    trackMarkerBarcode(id, markerSize) {
        // Create an object that tracks the marker transform.
        let trackerObjectMaterial = new THREE.MeshBasicMaterial( {color: 0x8888ff, side: THREE.DoubleSide, transparent: true } );
        trackerObjectMaterial.opacity = 0.7;
        let trackerObject = new THREE.Mesh( new THREE.PlaneGeometry(markerSize, markerSize), trackerObjectMaterial);
        trackerObject.matrixAutoUpdate = false;
        trackerObject.position.z = 0;

        // Use a barcode marker (type = 1)
        let markerRoot = this.arController.createThreeBarcodeMarker(id, markerSize);
        markerRoot.add(trackerObject);
        this.arScene.scene.add(markerRoot);
        console.log("DEBUG: MARKER =", markerRoot);

        return id;
    }

    /* NOTE: setDetectionMode currently always barcode-only
    // Start tracking pattern marker
    async trackMarkerPattern(patternUrl, markerSize) {  // '/data/patt.kanji' // 'data/patterns/pattern-kanji.patt'
        // Create an object that tracks the marker transform.
        let trackerObjectMaterial = new THREE.MeshBasicMaterial( {color: 0x8888ff, side: THREE.DoubleSide, transparent: true } );
        trackerObjectMaterial.opacity = 0.7;
        let trackerObject = new THREE.Mesh( new THREE.PlaneGeometry(markerSize, markerSize), trackerObjectMaterial);
        trackerObject.matrixAutoUpdate = false;
        trackerObject.position.z = 0;

        // Load the pattern marker to use (type = 0)
        return new Promise((resolve, reject) => {
        this.arController.loadMarker(patternUrl, (markerId) => {
            let markerRoot = this.arController.createThreeMarker(markerId, markerSize);
            markerRoot.add(trackerObject);
            this.arScene.scene.add(markerRoot);
            // console.log("DEBUG: MARKER-PATTERN #" + markerId);
            resolve(markerId);
        }, (err) => {
            reject(new Error(err));
        });
        });
    }
    */
    

    // Start tracking multi-marker
    async trackMultiMarker(multiMarkerUrl, region, subMarkerSize) {  // '/data/multi-barcode-8x6-no39.dat'   // 4x3, 8x6  // subMarkerSize=35
        // Load the multi-marker to use.
        return new Promise((resolve, reject) => {
            this.arController.loadMultiMarker(multiMarkerUrl, (marker, markerNum) => {

                // Create an object that tracks the marker transform.
                let multiObjectMaterial = new THREE.MeshBasicMaterial( {color: 0x88ff88, side: THREE.DoubleSide, transparent: true } );
                multiObjectMaterial.opacity = 0.2;
                let multiObject = new THREE.Mesh( new THREE.PlaneGeometry(region.right - region.left, region.bottom - region.top), multiObjectMaterial );
                multiObject.matrixAutoUpdate = false;
                multiObject.position.z = 0;
                let markerRoot = this.arController.createThreeMultiMarker(marker);
                // console.log('DEBUG: MARKER-MULTI #', marker, " with", markerNum, "submarkers", "=", markerRoot);
                this.arScene.scene.add(markerRoot);
                markerRoot.add(multiObject);

                // Sub-marker positions
                let subObjectMaterial = new THREE.MeshBasicMaterial( {color: 0xff8888, side: THREE.DoubleSide, transparent: true } );
                subObjectMaterial.opacity = 0.2;
                let makeSubObject = () => {
                    let plane = new THREE.Mesh( new THREE.PlaneGeometry(subMarkerSize, subMarkerSize), subObjectMaterial );
                    plane.matrixAutoUpdate = false;
                    plane.position.z = 0;
                    return plane;
                };
                for (let i = 0; i < markerNum; i++) {
                    markerRoot.markers[i] = makeSubObject();
                    markerRoot.add(markerRoot.markers[i]);
                }

                resolve(marker);
            }, (err) => {
                reject(new Error(err));
            });
        });
    }


    setProcessCallback(callback) {
        this.processCallback = callback;
    }

    setMarkerCallback(callback) {
        this.markerCallback = callback;
    }

    setMultiMarkerCallback(callback) {
        this.multiMarkerCallback = callback;
    }


    async initialize() {
        // TODO: Make these options
        const maxARVideoSize = 640;
        const cameraParam = './depends/artoolkit/data/camera_para.dat'; // 'data/camera_para.dat' 'data/camera_para-iPhone 5 rear 640x480 1.0m.dat'
        const usePattern = false;

        console.log("ARDETECTOR Creating getUserMedia scene...");
        await this.createMediaScene(maxARVideoSize, cameraParam);

        console.log("ARDETECTOR Creating renderer...");
        this.createRenderer();  // uses arController

        // Set detection mode
        this.setDetectionMode(usePattern);

        // --- callbacks for arController.process(image); ---
        this.arController.addEventListener('getMarker', (ev) => {
            //console.log("MARKER: ", "type", ev.data.type, "id", ev.data.marker.id, "patt=", ev.data.marker.idPatt, "matrix=", ev.data.marker.idMatrix); // ev.data
            if (this.markerCallback) {
                this.markerCallback(ev.data.type, ev.data.marker.id, ev.data.matrix.slice(0)); // .toArray()
            }
        });
        
        this.arController.addEventListener('getMultiMarker', (ev) => {
            // console.log("MULTI-MARKER #" + ev.data.multiMarkerId + ": ", [].join.call(ev.data.matrix, ', '));
            if (this.multiMarkerCallback) {
                this.multiMarkerCallback(ev.data.multiMarkerId, ev.data.matrix.slice(0)); // .toArray()
            }
        });
    }


    // CAUTION: Only call this once -- need to add stop/pause, etc.
    run() {
        // Start frame ticker
        const frameTick = () => {
            requestAnimationFrame(frameTick);
            this.arScene.process();
            if (this.processCallback) {
                this.processCallback(this.frameNumber);
            }
            this.arScene.renderOn(this.renderer);
            this.frameNumber++;
        }
        frameTick();
    }


    // Detect rectangles
    async detect(imageBitmapSource, detectOptions = {}) {
        //console.log('ARDETECTOR: detect...');

        // Wait for async startup
        await ArDetector.startupPromise;

        // Detection options
        const options = Object.assign(this.options, detectOptions);

        // TODO: Detect changes in input on non-video types
        throw new Error('ARDETECTOR: detect() not yet implemented');

        // Results
        const detectedMarkers = [];

        //console.log('ARDETECTOR: ...done' + JSON.stringify(detectedMarkers));
        return detectedMarkers;
    }
    
}
