// TextDetectorPolyfill
// Dan Jackson
//
// Partial implementation of TextDetector: https://wicg.github.io/shape-detection-api/text.html
// 
// Uses naptha's tesseract.js: https://github.com/naptha/tesseract.js
//

import { default as Tesseract } from './depends/tesseract-6.esm.min.js';

export class TextDetectorPolyfill {

    // _options is non-standard
    constructor(_options) {
        this.options = Object.assign({
            langs: 'eng',
        }, _options);

        // Determine paths relative to this script
        this.tesseractPaths = {
            workerPath: './depends/worker-6.0.0.min.js',
            langPath: './depends',
            corePath: './depends/tesseract-core-simd-lstm-6.0.0.wasm.js',
        };
        const base = window.location.toString();
        for (const key in this.tesseractPaths) {
            let value = this.tesseractPaths[key];
            // Full URL, relative to this script
            value = (new URL(value, import.meta.url)).toString();
            // Remove the page URL as a base
            if (value.startsWith(base)) {
                value = value.substring(base.length);
                if (value.startsWith('/')) {
                    value = value.substring(1);
                }
                value = './' + value;
            }
            this.tesseractPaths[key] = value;
        }
        //console.log(JSON.stringify(this.tesseractPaths, null, 4));

        // Begin async startup
        this.tesseract = null;
        this.startupPromise = new Promise((resolve, reject) => {
            this.startupResolve = resolve;
            this.startupReject = reject;
        });
        this._startup();
    }

    async _startup() {
        // Initialize Tesseract
        console.log('TEXT: startup...')
        try {
            this.tesseract = await Tesseract.createWorker(this.options.langs, 1, {
                ...this.tesseractPaths,
                //logger: msg => { console.log('TESSERACT: ' + JSON.stringify(msg, null, 4)); },
            });
            console.log('TEXT: startup done.')
            this.startupResolve(this.tesseract);
        } catch (e) {
            this.startupReject(e);
        }
    }

    async _shutdown() {
        console.log('TEXT: terminate')
        await this.startupPromise;  // Wait for async startup
        await this.tesseract.terminate();
        this.tesseract = null;
        console.log('TEXT: done')
    }

    static _parseHOcr(hocrString) {
        // Parse hOCR
        if (!this.domParser) {
            this.domParser = new DOMParser();
        }
        const ocrDom = this.domParser.parseFromString(hocrString, 'text/html');

        // Parse class="ocr_line"
        const lines = [];
        const lineElements = ocrDom.querySelectorAll('.ocr_line');
        for (const lineElement of lineElements) {
            const words = [];
            const wordElements = lineElement.querySelectorAll('.ocrx_word');
            for (const wordElement of wordElements) {
                const word = {
                    text: wordElement.innerText
                };
                // Parse word's title attribute
                const title = wordElement.getAttribute('title');
                const attributes = title ? title.split(';') : [];
                for (const attribute of attributes) {
                    const parts = attribute.split(' ').map(part => part.trim()).filter(part => part.length > 0).map(part => /^-?\d+(\.\d+)?$/.test(part) ? parseFloat(part) : part);
                    if (parts.length == 0) continue;
                    else if (parts.length == 1) word[parts[0]] = null;
                    else if (parts.length == 2) word[parts[0]] = parts[1];
                    else word[parts[0]] = parts.slice(1);
                }
                words.push(word);
            }

            const line = {
                words: words,
            }
            // Parse line's title attribute
            const title = lineElement.getAttribute('title');
            const attributes = title ? title.split(';') : [];
            for (const attribute of attributes) {
                const parts = attribute.split(' ').map(part => part.trim()).filter(part => part.length > 0).map(part => /^-?\d+(\.\d+)?$/.test(part) ? parseFloat(part) : part);
                if (parts.length == 0) continue;
                else if (parts.length == 1) line[parts[0]] = null;
                else if (parts.length == 2) line[parts[0]] = parts[1];
                else line[parts[0]] = parts.slice(1);
            }
            lines.push(line);
        }
        return {
            lines:lines
        }
    }

    static _boundingBoxToCornerPoints(boundingBox) {
        return [
            { x: boundingBox.left, y: boundingBox.top },
            { x: boundingBox.right, y: boundingBox.top },
            { x: boundingBox.right, y: boundingBox.bottom },
            { x: boundingBox.left, y: boundingBox.bottom },
        ];
    }

    static _convertHocrToDetectedTexts(parsedHocr) {
        const detectedTexts = [];
        for (const line of parsedHocr.lines) {
            const detectedText = {};

            // Standard line information
            detectedText.boundingBox = new DOMRectReadOnly(line.bbox[0], line.bbox[1], line.bbox[2] - line.bbox[0], line.bbox[3] - line.bbox[1]);
            detectedText.cornerPoints = TextDetectorPolyfill._boundingBoxToCornerPoints(detectedText.boundingBox);
            detectedText.rawValue = line.words.map(word => word.text).join(' ');

            // Non-standard per-word information
            let confidenceSum = 0, confidenceCount = 0;
            detectedText._words = line.words.map(word => {
                const newWord = {
                    rawValue: word.text,
                    boundingBox: new DOMRectReadOnly(word.bbox[0], word.bbox[1], word.bbox[2] - word.bbox[0], word.bbox[3] - word.bbox[1]),
                    _confidence: word.x_wconf,
                };
                newWord.cornerPoints = TextDetectorPolyfill._boundingBoxToCornerPoints(newWord.boundingBox);
                if ('confidence' in newWord) {
                    confidenceSum += newWord._confidence;
                    confidenceCount++;
                }
                return newWord;
            });
            detectedText._confidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;

            detectedTexts.push(detectedText);
        }
        return detectedTexts;
    }


    // NOTE: _options is non-standard
    async detect(imageBitmapSource, _options = {}) {
        // Wait for async startup
        await this.startupPromise;

        await this.tesseract.setParameters({
            tessedit_char_whitelist: _options.allowList ? _options.allowList : '',
        });

        const recognizeOptions = {};
        if (_options._rectangle) {
            recognizeOptions.rectangle = _options._rectangle;
        }

        // TODO: May need to convert from some sources (e.g. from video element?)
        // The imageBitmapSource could be one of: Blob, HTMLCanvasElement, HTMLImageElement, HTMLVideoElement, ImageBitmap, ImageData, OffscreenCanvas, SVGImageElement, VideoFrame.
        // The underlying polyfill works with: HTMLCanvasElement, HTMLImageElement, 'data:' URLs, buffer -- see: https://github.com/naptha/tesseract.js/blob/master/docs/image-format.md

        // Recognize text
        const ret = await this.tesseract.recognize(imageBitmapSource, recognizeOptions, { hocr: true });
        const parsedHocr = TextDetectorPolyfill._parseHOcr(ret.data.hocr);
        const detectedTexts = TextDetectorPolyfill._convertHocrToDetectedTexts(parsedHocr);

        // Non-standard: overall confidence
        detectedTexts.confidence = ret.data.confidence;

        //console.log('TEXT: ...done' + JSON.stringify(detectedTexts));
        return detectedTexts;
    }


    // Check TextDetector, returns TextDetector if working, otherwise Error()
    static async checkTextDetector() {
        if (!('TextDetector' in window)) {
            return new Error('API not found');
        } else {
            try {
                // Try to create a TextDetector and detect with it - may throw NotSupportedError
                const textDetector = await new TextDetector();
                const canvas = document.createElement('canvas');

                // Draw test text
                const testText = 'Test';
                const ctx = canvas.getContext('2d');
                ctx.font = '30px sans-serif';
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.fillStyle = 'black';
                ctx.fillText(testText, 50, ctx.canvas.height / 2);

                const texts = await textDetector.detect(canvas);
                if (texts.length == 0) {
                    return new Error('No text detected');
                }
                if (texts.length > 1) {
                    return new Error('Too many texts detected: ' + texts.length);
                }
                if (texts[0].rawValue.length == 0) {
                    return new Error('Empty text detected');       // appears to happen on macOS
                }
                if (texts[0].rawValue != testText) {
                    return new Error('Incorrect text detected: "' + texts[0].rawValue + '" (expected "' + testText + '")');
                }
                // Otherwise, as expected
                return textDetector;
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
        let textDetector = null;
        // Check TextDetector and polyfill if required
        let unsupportedTextDetector = await TextDetectorPolyfill.checkTextDetector();
        if (forcePolyfill && !(unsupportedTextDetector instanceof Error)) {
            unsupportedTextDetector = new Error('Despite the built-in TextDetector working, the polyfill is being forced instead');
        }
        if (unsupportedTextDetector instanceof Error) {
            console.log('NOTE: Built-in TextDetector problem (will try polyfill): ' + unsupportedTextDetector);
            window['TextDetector'] = TextDetectorPolyfill;
            unsupportedTextDetector = await TextDetectorPolyfill.checkTextDetector();
            if (unsupportedTextDetector instanceof Error) {
                console.log('ERROR: TextDetector problem: ' + unsupportedTextDetector);
            }
        }
        // Re-use test instance
        if (!(unsupportedTextDetector instanceof Error)) {
            textDetector = unsupportedTextDetector;
        }
        return textDetector;
    }

}
