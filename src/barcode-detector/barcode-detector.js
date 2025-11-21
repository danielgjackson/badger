// BarcodeDetectorPolyfill
// Dan Jackson
// 
// Implementation of BarcodeDetector: https://wicg.github.io/shape-detection-api/#barcode-detection-api
//
// This is just a lightly-patched version of undecaf's BarcodeDetectorPolyfill:
//   https://github.com/undecaf/barcode-detector-polyfill
// ...to return the exact corner point coordinates, rather than just the bounding box.
//
import { BarcodeDetectorPolyfill as OriginalBarcodeDetectorPolyfill } from './depends/barcode-detector-polyfill-0.9.21.js';

export class BarcodeDetectorPolyfill extends OriginalBarcodeDetectorPolyfill {
    constructor(...args) {
        super(...args);
    }

    toBarcodeDetectorResult(symbol) {
        const barcode = super.toBarcodeDetectorResult(symbol);
        // TODO: If using for barcode types other than 'qr_code', verify that all four vertices are given, and the vertex order is as expected
        if (symbol.points.length == 4) {
            barcode.cornerPoints = [
                symbol.points[0],
                symbol.points[3],
                symbol.points[2],
                symbol.points[1],
            ];
            //console.log('PATCHED: ' + JSON.stringify(barcode.cornerPoints));
        }
        return barcode;
    }


    // Check BarcodeDetector, returns BarcodeDetector if working, otherwise Error().
    static async checkBarcodeDetector(format = 'qr_code') {
        if (!('BarcodeDetector' in window)) {
            return new Error('API not found');
        } else {
            try {
                if (!(await BarcodeDetector.getSupportedFormats()).includes(format)) {
                    return new Error('Format not supported: ' + format);
                } else {
                    // Try to create a BarcodeDetector and detect with it - may throw NotSupportedError
                    const barcodeDetector = await new BarcodeDetector({ formats: [ format ] });
                    // TODO: Add a test barcode of the correct format to the canvas to verify the detector works
                    const barcodes = barcodeDetector.detect(document.createElement('canvas'));
                    if (barcodes.length > 0) {
                        return new Error('Unexpected barcode detected');
                    }
                    // Otherwise, as expected
                    return barcodeDetector;
                }
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
        let barcodeDetector = null;
        // Check BarcodeDetector and polyfill if required
        let unsupportedBarcodeDetector = await BarcodeDetectorPolyfill.checkBarcodeDetector();
        if (forcePolyfill && !(unsupportedBarcodeDetector instanceof Error)) {
            unsupportedBarcodeDetector = new Error('Despite the built-in BarcodeDetector working, the polyfill is being forced instead');
        }
        if (unsupportedBarcodeDetector instanceof Error) {
            console.log('NOTE: Built-in BarcodeDetector problem (will try polyfill): ' + unsupportedBarcodeDetector);
            window['BarcodeDetector'] = BarcodeDetectorPolyfill;
            unsupportedBarcodeDetector = await BarcodeDetectorPolyfill.checkBarcodeDetector();
            if (unsupportedBarcodeDetector instanceof Error) {
                console.log('ERROR: BarcodeDetector problem: ' + unsupportedBarcodeDetector);
            }
        }
        // Re-use test instance
        if (!(unsupportedBarcodeDetector instanceof Error)) {
            barcodeDetector = unsupportedBarcodeDetector;
        }
        return barcodeDetector;
    }

}
