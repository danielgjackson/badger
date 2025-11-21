// FaceDetectorPolyfill
// Dan Jackson
//
// Partial implementation of FaceDetector: https://wicg.github.io/shape-detection-api/#face-detection-api
// 
// Uses justadudewhohacks's face-api.js: https://github.com/justadudewhohacks/face-api.js
//

//import { default as faceapi } from './depends/face-api.min.js';

export class FaceDetectorPolyfill {

    constructor(options) {
        this.options = Object.assign({
            // Standard options
            maxDetectedFaces: null, 
            fastMode: false, 
            // Non-standard options
            _inputSize: 224, 
            _scoreThreshold: 0.5, 
        }, options);

        // Begin async startup
        if (!FaceDetectorPolyfill.startupPromise) {
            FaceDetectorPolyfill.startupPromise = new Promise((resolve, reject) => {
                FaceDetectorPolyfill.startupResolve = resolve;
                FaceDetectorPolyfill.startupReject = reject;
            });
            FaceDetectorPolyfill._startup();
        }
    }

    static async _startup() {
        try {
            // Initialize Face Detector
            console.log('FACE: startup...')

            // Determine model path relative to this script
            let baseUrl = './depends/';
            const base = window.location.toString();
            // Full URL, relative to this script
            baseUrl = (new URL(baseUrl, import.meta.url)).toString();
            // Remove the page URL as a base
            if (baseUrl.startsWith(base)) {
                baseUrl = baseUrl.substring(base.length);
                if (baseUrl.startsWith('/')) {
                    baseUrl = baseUrl.substring(1);
                }
                baseUrl = './' + baseUrl;
            }
            //console.log(JSON.stringify(baseUrl, null, 4));
            
            // Dynamically load face-api.js via a script tag
            let scriptFile = './depends/face-api.min.js';
            // Full URL, relative to this script
            scriptFile = (new URL(scriptFile, import.meta.url)).toString();
            // Remove the page URL as a base
            if (scriptFile.startsWith(base)) {
                scriptFile = scriptFile.substring(base.length);
                if (scriptFile.startsWith('/')) {
                    scriptFile = scriptFile.substring(1);
                }
                scriptFile = './' + scriptFile;
            }
            //console.log(JSON.stringify(scriptFile, null, 4));

            const scriptElem = document.createElement('script');
            scriptElem.src = scriptFile;
            document.head.appendChild(scriptElem);
            await new Promise((resolve, reject) => {
                scriptElem.onload = resolve;
                scriptElem.onerror = reject;
            });

            // Load face models
            await faceapi.nets.tinyFaceDetector.load(baseUrl);
            await faceapi.loadFaceLandmarkModel(baseUrl);

            console.log('FACE: startup done.')
            FaceDetectorPolyfill.startupResolve();
        } catch (e) {
            FaceDetectorPolyfill.startupReject(e);
        }
    }

    static _parseResult(results) {
        if (!results) { return results; }
        const detectedFaces = [];

        // DetectedFace {
        //   boundingBox, // new DOMRectReadOnly(x, y, width, height)
        //   landmarks,   // Array<{ locations: Array<{ x, y }>, type: "mouth"|"eye"|"nose" }>
        // }

        for (const result of results) {
            const boundingBox = new DOMRectReadOnly(  // alignedRect
                result.detection.box.x,
                result.detection.box.y,
                result.detection.box.width,
                result.detection.box.height,
            );

            const landmarkMap = {
                "mouth": [
                    result.landmarks.getMouth(),
                ],
                "eye": [
                    result.landmarks.getLeftEye(),
                    result.landmarks.getRightEye(),
                ],
                "nose": [
                    result.landmarks.getNose(),
                ],
                // Non-standard
                "_eyeBrow": [
                    result.landmarks.getLeftEyeBrow(),
                    result.landmarks.getRightEyeBrow(),
                ],
                "_jawOutline": [
                    result.landmarks.getJawOutline(),
                ],
                "_refPointsForAlignment": [
                    result.landmarks.getRefPointsForAlignment(),
                ],
            };

            // Map landmarks
            const landmarks = [];
            for (const [type, sourceLandmarks] of Object.entries(landmarkMap)) {
                for (const sourceLandmark of sourceLandmarks) {
                    const landmark = {
                        type,
                        locations: sourceLandmark.map((point) => { return { x: point.x, y: point.y }; }),
                    };
                    landmarks.push(landmark);
                }
            }

            const detectedFace = {
                boundingBox,
                landmarks,
                // Non-standard
                _score: result.detection.score,
            };

            detectedFaces.push(detectedFace);
        }
  
        return detectedFaces;
    }


    // NOTE: _options is non-standard
    async detect(imageBitmapSource, _options = {}) {
        // Wait for async startup
        await FaceDetectorPolyfill.startupPromise;

        // Detection options
        const combinedOptions = Object.assign(this.options, _options);
        const options = {};
        // Standard options
        //maxDetectedFaces
        //fastMode
        // Non-standard options
        options.inputSize = combinedOptions._inputSize;
        options.scoreThreshold = combinedOptions._scoreThreshold;

        // TODO: May need to convert from some sources (e.g. from video element?)
        // The imageBitmapSource could be one of: Blob, HTMLCanvasElement, HTMLImageElement, HTMLVideoElement, ImageBitmap, ImageData, OffscreenCanvas, SVGImageElement, VideoFrame.
        // The underlying faceapi.js works with: ???

        // Recognize faces
        const detectOptions = new faceapi.TinyFaceDetectorOptions(options);
        let process = faceapi.detectAllFaces(imageBitmapSource, detectOptions);
        process = process.withFaceLandmarks();
        //process = process.withFaceExpressions();
        //process = process.withFaceDescriptors();
        const result = await process;

        // Show the detection results on the video overlay
        //const dims = faceapi.matchDimensions(canvas, videoElement, true);
        //const resizedResult = faceapi.resizeResults(result, dims);
        //faceapi.draw.drawDetections(canvas, resizedResult);
        //faceapi.draw.drawFaceLandmarks(canvas, resizedResult);

        const detectedFaces = FaceDetectorPolyfill._parseResult(result);

        //console.log('FACE: ...done' + JSON.stringify(detectedFaces));
        return detectedFaces;
    }

    // Check FaceDetector, returns FaceDetector if working, otherwise Error().
    static async checkFaceDetector() {
        if (!('FaceDetector' in window)) {
            return new Error('API not found');
        } else {
            try {
                // Try to create a FaceDetector and detect with it - may throw NotSupportedError
                const faceDetector = await new FaceDetector();
                const canvas = document.createElement('canvas');
                const faces = await faceDetector.detect(canvas);
                if (faces.length != 0) {
                    return new Error('Unexpected face detected');
                }
                // Otherwise, as expected
                return faceDetector;
            } catch (e) {   // e.name === 'NotSupportedError'
                if (e.name == 'NotSupportedError') {
                    return new Error('NotSupportedError');
                } else {
                    return new Error('Unexpected error while testing: ' + e.name);
                }
            }
        }
        return null;
    }
    
    static async getInstanceAutoPolyfill(forcePolyfill) {
        let faceDetector = null;
        let unsupportedFaceDetector = await FaceDetectorPolyfill.checkFaceDetector();
        if (forcePolyfill && !(unsupportedFaceDetector instanceof Error)) {
            unsupportedFaceDetector = new Error('Despite the built-in FaceDetector working, the polyfill is being forced instead');
        }
        if (unsupportedFaceDetector instanceof Error) {
            console.log('NOTE: Built-in FaceDetector problem (will try polyfill): ' + unsupportedFaceDetector);
            window['FaceDetector'] = FaceDetectorPolyfill;
            unsupportedFaceDetector = await FaceDetectorPolyfill.checkFaceDetector();
            if (unsupportedFaceDetector instanceof Error) {
                console.log('ERROR: FaceDetector problem: ' + unsupportedFaceDetector);
            }
        }
        // Re-use test instance
        if (!(unsupportedFaceDetector instanceof Error)) {
            faceDetector = unsupportedFaceDetector;
        }
        return faceDetector;
    }

}
