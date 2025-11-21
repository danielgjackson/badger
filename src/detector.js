import { lineIntercept } from './utils.js';
import { BarcodeDetectorPolyfill } from './barcode-detector/barcode-detector.js';
import { TextDetectorPolyfill } from './text-detector/text-detector.js';
import { FaceDetectorPolyfill } from './face-detector/face-detector.js';
import { RectangleDetector } from './rectangle-detector/rectangle-detector.js';
import { DebugLayer } from './debug-layer.js';
import { Homography } from './homography.js';

const defaultOptions = {
    // Camera
    videoWidth: 1280,
    videoHeight: 720,
    videoFacing: 'user',

    // Ignore some QR codes
    ignoreCodeRegex: null,
    //ignoreCodeRegex: '^(?:WIFI:)',
    //ignoreCodeRegex: '^(?:WIFI:|https?:\/\/|HTTPS?:\/\/|www.)',
    barcodeForcePolyfill: false,

    // Projected badge edges based on the QR code dimension
    viewport: {
        x: -1.8,
        y: -2.85,
        width: 3.6,
        height: 3.6,
    },

    // OCR parameters
    ocrForcePolyfill: false, // Use polyfill, even if built-in TextDetector is available
    ocrWidth: 640, // ocrHeight calculated from viewport to give square pixels
    ocrRectangle: null,
    // ocrRectangle: {
    //     x: 50/640,
    //     y: 150/640,
    //     width: (640-2*50)/640,
    //     height: (400-150)/640,
    // },
    ocrCleanRegex: '[a-zA-ZÀ-ÖÙ-öù-ÿĀ-žḀ-ỿ0-9 \n]+',
    ocrDeleteRegex: '^.?.?C.?(?:H.*|.*[0-9]+).?.?.?',
    ocrCleanTrim: true,
    ocrCleanRemoveDoubleSpaces: true,

    // Test
    faceDetector: false,
    faceForcePolyfill: false,
    rectangleDetector: true,
    rectangleDebug: null, // '#rectangleDebug',
};


export class Detector {

    constructor(options) {
        // defaults
        this.options = Object.assign(defaultOptions, options || {});;

        // Convert regex options
        if (this.options.ocrCleanRegex) {
            this.options.ocrCleanRegex = new RegExp(this.options.ocrCleanRegex, 'gmv');
        }
        if (this.options.ocrDeleteRegex) {
            this.options.ocrDeleteRegex = new RegExp(this.options.ocrDeleteRegex, 'gmv');
        }
        if (this.options.ignoreCodeRegex) {
            this.options.ignoreCodeRegex = new RegExp(this.options.ignoreCodeRegex, 'gmv');
        }
    }

    async init() {
        // Add video debug layer
        this.videoElem = document.querySelector('video');
        this.cameraDebug = new DebugLayer(this.videoElem);
        this.outputImage = document.querySelector('.outputContainer img');
        this.outputDebug = new DebugLayer(this.outputImage);

        // Detect problems preventing compatibility
        if (location.protocol == 'file:' || (location.protocol == 'http:' && location.hostname != 'localhost' && location.hostname != '127.0.0.1')) {
            return 'ERROR: This page must be served over HTTPS (or HTTP on localhost), and will not work directly from a local file.';
        }

        // Get Shape Detector APIs
        this.barcodeDetector = await BarcodeDetectorPolyfill.getInstanceAutoPolyfill(this.options.barcodeForcePolyfill);
        this.textDetector = await TextDetectorPolyfill.getInstanceAutoPolyfill(this.options.ocrForcePolyfill);
        if (this.options.faceDetector) {
            this.faceDetector = await FaceDetectorPolyfill.getInstanceAutoPolyfill(this.options.faceForcePolyfill);
        }
        if (this.options.rectangleDetector) {
            this.rectangleDetector = new RectangleDetector();
        }

        // Cannot continue if BarcodeDetector or TextDetector are not supported or polyfilled
        if (this.textDetector == null || this.barcodeDetector == null) {
            let message = '';
            message += 'ERROR: The required parts of the <a href="https://developer.chrome.com/docs/capabilities/shape-detection#barcodedetector">Shape Detection API</a> are not fully supported in this browser\'s current configuration. ';
            if (this.barcodeDetector == null) {
                message += '[BarcodeDetector: ' + unsupportedBarcodeDetector + '] ';
            }
            if (this.textDetector == null) {
                message += '[TextDetector: ' + unsupportedTextDetector + '] ';
            }
            message += 'If you are using a <em>Chromium</em>-based browser, try enabling this flag and reload the page: <a href="about://flags#enable-experimental-web-platform-features">about://flags#enable-experimental-web-platform-features</a>. ';
            return message;
        }

        // Check mediaDevices
        if (!('mediaDevices' in navigator)) {
            return 'ERROR: The <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices">MediaDevices API</a> is not supported in this browser.  Ensure you are serving the file over HTTPS.';
        }

        // Check number of cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (devices.length <= 0) {
            return 'ERROR: There are no cameras available.';
        }

        // Text recognizer
        console.log('TEXT: createWorker');

        // No errors detected
        return null;
    }

    getPerspectiveTransform(src, dst) {
        return projectiveMatrixFromSquaresXY(src, dst);
    }

    // Get perspective transform for a unit square
    computeUnitSquareTransform(cornerPoints) {
        //const src = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}];
        const src = [{x: -0.5, y: -0.5}, {x: 0.5, y: -0.5}, {x: 0.5, y: 0.5}, {x: -0.5, y: 0.5}];
        const dst = cornerPoints;
        const transform = Homography.calculateTransformFromSquaresXY(src, dst);
//console.log(transform);
//transform.inverse = Homography.calculateTransformFromSquaresXY(dst, src);
        return transform;
    }

    // Apply transform to point
    applyTransform(transform, point) {
        return Homography.transformPointXY(transform, point);
    }

    extrapolateRegion(cornerPoints) {
        const retVal = {};

        // Centre point
        retVal.centre = lineIntercept({ start: cornerPoints[0], end: cornerPoints[2] }, { start: cornerPoints[1], end: cornerPoints[3] });

        // Homography
        const transform = this.computeUnitSquareTransform(cornerPoints);
        if (transform) {

            let viewport = this.options.viewport;
            retVal.extrapolatedPoints = [
                this.applyTransform(transform, { x: viewport.x,                  y: viewport.y }),
                this.applyTransform(transform, { x: viewport.x + viewport.width, y: viewport.y }),
                this.applyTransform(transform, { x: viewport.x + viewport.width, y: viewport.y + viewport.height }),
                this.applyTransform(transform, { x: viewport.x,                  y: viewport.y + viewport.height }),
            ];

            // New: Use the ocrRectangle to crop the viewport *before* applying the homography
            if (this.options.ocrRectangle) {
                // Update the viewport to the cropped region
                viewport = {
                    x: viewport.x + this.options.ocrRectangle.x * viewport.width,
                    y: viewport.y + this.options.ocrRectangle.y * viewport.height,
                    width: this.options.ocrRectangle.width * viewport.width,
                    height: this.options.ocrRectangle.height * viewport.height,
                };
                retVal.ocrPoints = [
                    this.applyTransform(transform, { x: viewport.x,                  y: viewport.y }),
                    this.applyTransform(transform, { x: viewport.x + viewport.width, y: viewport.y }),
                    this.applyTransform(transform, { x: viewport.x + viewport.width, y: viewport.y + viewport.height }),
                    this.applyTransform(transform, { x: viewport.x,                  y: viewport.y + viewport.height }),
                ];
            }

            if (!this.homography) {
                this.homography = new Homography();
            }
            const srcImage = document.querySelector('video');
            const dstWidth = this.options.ocrWidth;
            this.options.ocrHeight = Math.floor(viewport.height * dstWidth / viewport.width);
            const dstHeight = this.options.ocrHeight;
            const dstImageData = this.homography.warpImage(srcImage, transform, dstWidth, dstHeight, viewport);
            const dataUrl = this.homography.dataURLFromImageData(dstImageData);
            this.outputImage.src = dataUrl;

        }

        return retVal;
    }

    async start() {
        // Establish video stream
        let mediaStream = null;
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    width: { ideal: this.options.videoWidth },
                    height: { ideal: this.options.videoHeight },
                    facingMode: this.options.videoFacing,
                },
            });
        } catch (e) {
            showError('ERROR: The <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices">MediaDevices API</a> failed.  Ensure you are serving the file over HTTPS.');
            return false;
        }

        // Decoded barcodes
        let decoding = false;
        let decode = async () => {
            if (decoding) return;
            decoding = true;

            const barcodes = await this.barcodeDetector.detect(this.videoElem);

            let faces = null;
            if (this.options.faceDetector) {
                faces = await this.faceDetector.detect(this.videoElem);
            }

            let rectangles = null;
            if (this.options.rectangleDetector) {
                rectangles = await this.rectangleDetector.detect(this.videoElem, {
                    debug: this.options.rectangleDebug ? document.querySelector(this.options.rectangleDebug) : null,
                });
            }

            this.cameraDebug.debugClear();
            this.cameraDebug.debugDrawText({ x: 50, y: 50 }, '...', 'white', '16px sans-serif');

            if (faces) {
                for (const face of faces) {
                    this.cameraDebug.debugDrawRect(face.boundingBox, 'yellow');

                    for (const landmark of face.landmarks) {
                        let color = {
                            "eye": 'blue',
                            "nose": 'green',
                            "mouth": 'red',
                            "_eyeBrow": 'black',
                            "_jawOutline": 'brown',
                        }[landmark.type];
                        if (!color) continue;
                        // Draw lines between each landmark location
                        for (let i = 1; i < landmark.locations.length; i++) {
                            this.cameraDebug.debugDraw(landmark.locations[i-1], landmark.locations[i], color);
                        }
                    }
                }
            }

            if (rectangles) {
                for (const rectangle of rectangles) {
                    this.cameraDebug.debugDrawQuad(rectangle.cornerPoints, 'blue');
                }
            }

            let barcodeCount = 0;
            for (const barcode of barcodes) {
                if (barcode.format != 'qr_code') {
                    console.log('WARNING: Ignoring barcode format: ' + barcode.format);
                    continue;
                }

                if (this.options.ignoreCodeRegex && this.options.ignoreCodeRegex.test(barcode.rawValue)) {
                    console.log('WARNING: Ignoring barcode with unexpected value: ' + barcode.rawValue);
                    continue;
                }

                barcodeCount++;

                //barcode.rawValue;
                //barcode.cornerPoints[0..3].{x, y};
                //console.log(`QR Code: @(${barcode.cornerPoints[0].x},${barcode.cornerPoints[0].y}),(${barcode.cornerPoints[1].x},${barcode.cornerPoints[1].y}),(${barcode.cornerPoints[2].x},${barcode.cornerPoints[2].y}),(${barcode.cornerPoints[3].x},${barcode.cornerPoints[3].y}) -- ${barcode.rawValue}`);
                this.cameraDebug.debugDrawQuad(barcode.cornerPoints, 'lightgreen');

                const extrapolated = this.extrapolateRegion(barcode.cornerPoints);
                if (extrapolated && extrapolated.centre) {
                    this.cameraDebug.debugDrawText(extrapolated.centre, 'X', 'lightgreen', '16px sans-serif');
                }
                if (extrapolated && extrapolated.extrapolatedPoints) {
                    this.cameraDebug.debugDrawQuad(extrapolated.extrapolatedPoints, 'red');
                }
                if (extrapolated && extrapolated.ocrPoints) {
                    this.cameraDebug.debugDrawQuad(extrapolated.ocrPoints, 'orange');
                }
                    

                const qrPoint = {
                    x: barcode.boundingBox.x + barcode.boundingBox.width / 2,
                    y: barcode.boundingBox.y + barcode.boundingBox.height / 2,
                };
                this.cameraDebug.debugDrawText(qrPoint, barcode.rawValue, 'pink', '8px sans-serif');

                // Recognize text
                let detectedTextBlocks = null;
//                console.log('TEXT: recognize');
/*
                if (this.options.ocrRectangle) {
                    const ocrRectangle = {
                        left: this.options.ocrRectangle.x * this.options.ocrWidth,
                        top: this.options.ocrRectangle.y * this.options.ocrHeight,
                        width: this.options.ocrRectangle.width * this.options.ocrWidth,
                        height: this.options.ocrRectangle.height * this.options.ocrHeight,
                    };
                    detectedTextBlocks = await this.textDetector.detect(this.outputImage, { _rectangle: ocrRectangle});
                } else
*/
                {
                    detectedTextBlocks = await this.textDetector.detect(this.outputImage);
                }

                // Output debug
                this.outputDebug.debugClear();
                //this.outputDebug.debugDrawText({ x: 50, y: 50 }, '...', 'white', '16px sans-serif');
                //this.outputDebug.debugDrawRect(ocrRectangle, 'yellow');
                //console.dir(parsedHocr);

                const allTexts = [];
                for (const detectedText of detectedTextBlocks) {
                    // text.boundingBox.{x, y, width, height, top, right, bottom, left}
                    // text.cornerPoints[0..3].{x, y}
                    // text.rawValue

                    // Per-word information
                    if (detectedText._words) {
                        for (const word of detectedText._words) {
                            this.outputDebug.debugDrawQuad(word.cornerPoints, 'cyan');      // Word box
                            const wordMidpoint = {
                                x: word.boundingBox.x + word.boundingBox.width / 2,
                                y: word.boundingBox.y + word.boundingBox.height / 2,
                            };
                            if (word._confidence) this.outputDebug.debugDrawText({ x: wordMidpoint.x, y: wordMidpoint.y + word.boundingBox.height / 2 + 4}, '' + word._confidence, 'white', '10px sans-serif');
                            this.outputDebug.debugDrawText(wordMidpoint, word.rawValue, 'magenta', '16px sans-serif');
                        }
                    } else {
                        // Line information
                        const lineMidpoint = {
                            x: detectedText.boundingBox.x + detectedText.boundingBox.width / 2,
                            y: detectedText.boundingBox.y + detectedText.boundingBox.height / 2,
                        };
                        if (detectedText._confidence) this.outputDebug.debugDrawText({ x: lineMidpoint.x, y: lineMidpoint.y + detectedText.boundingBox.height / 2 + 4}, '' + detectedText._confidence, 'white', '10px sans-serif');
                        this.outputDebug.debugDrawText(lineMidpoint, detectedText.rawValue, 'magenta', '16px sans-serif');
                    }
                    this.outputDebug.debugDrawQuad(detectedText.cornerPoints, '#0000ff40');      // blue - Line box

                    //console.log(text.rawValue);
                    if (detectedText.rawValue) {
                        allTexts.push(detectedText.rawValue);
                    }
                }

                // Confidence
                const confidence = detectedTextBlocks.confidence || null;

                // Clean up text
                const originalText = allTexts.join('\n');
                let text = originalText;
                if (this.options.ocrCleanRegex) {
                    const results = this.options.ocrCleanRegex.exec(originalText);
                    if (results) {
                        text = results.join(' ');
                    }
                }
                let lines = text.split('\n');
                if (this.options.ocrCleanRemoveDoubleSpaces) {
                    lines = lines.map(line => line.replace(/\s+/g, ' '));
                }
                if (this.options.ocrCleanTrim) {
                    lines = lines.map(line => line.trim());
                }
                if (this.options.ocrDeleteRegex) {
                    lines = lines.filter(line => !this.options.ocrDeleteRegex.test(line));
                }
                lines = lines.filter(line => line.length > 0);
                text = lines.join('\n');

                // Output
                document.querySelector('.outputContainer .confidence').value = confidence;
                document.querySelector('.outputContainer .confidence').innerText = confidence;
                document.querySelector('.outputContainer output').innerText = text;

            }   // for each barcode

            decoding = false;
        };

        // Start video
        this.videoElem.srcObject = mediaStream;
        this.videoElem.addEventListener('loadedmetadata', () => {
            this.videoElem.play();
        }, false);
        this.videoElem.addEventListener('loadeddata', () => {
            setInterval(decode, 125);
        }, false);

        return;
    }
}
