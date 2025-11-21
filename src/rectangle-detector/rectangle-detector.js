// RectangleDetector
// Dan Jackson
//
// Finds (perspective distorted) rectangles in an image.
// 
// Uses opencv.js: https://docs.opencv.org/4.11.0/d5/d10/tutorial_js_root.html
//
// Source: https://docs.opencv.org/4.11.0/opencv.js
//

//import { default as cv } from './depends/opencv-4.11.0.js';

export class RectangleDetector {

    constructor(options) {
        this.options = Object.assign({
            minArea: 500,
            resizedWidth: 320,
            maxSideRatio: 1.8,
        }, options);

        // Begin async startup
        if (!RectangleDetector.startupPromise) {
            RectangleDetector.startupPromise = new Promise((resolve, reject) => {
                RectangleDetector.startupResolve = resolve;
                RectangleDetector.startupReject = reject;
            });
            RectangleDetector._startup();
        }
    }



    static async _startup() {
        // Initialize
        try {
            console.log('RECT: startup...');

            // Dynamically load opencv.js via a script tag
            let scriptFile = './depends/opencv-4.11.0.js';
            // Full URL, relative to this script
            scriptFile = (new URL(scriptFile, import.meta.url)).toString();
            // Remove the page URL as a base
            const base = window.location.toString();
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

            // Await initialization
            window.cv = await cv;

            console.log('RECT: startup done.');
            //console.dir(cv);
            RectangleDetector.startupResolve(cv);
        } catch (e) {
            RectangleDetector.startupReject(e);
        }
    }


    // Order an array for four [x, y] points to be in clockwise order
    static _orderPoints(corners) {
        // Find the index of the smallest and largest sums and differences
        let smallestSumIndex, largestSumIndex;
        let smallestSumValue, largestSumValue;
        let smallestDiffIndex, largestDiffIndex;
        let smallestDiffValue, largestDiffValue;
        for (let i = 0; i < corners.length; i++) {
            const sum = corners[i].x + corners[i].y;
            const diff = corners[i].y - corners[i].x;
            if (i == 0 || sum < smallestSumValue) {
                smallestSumIndex = i;
                smallestSumValue = sum;
            }
            if (i == 0 || sum > largestSumValue) {
                largestSumIndex = i;
                largestSumValue = sum;
            }
            if (i == 0 || diff < smallestDiffValue) {
                smallestDiffIndex = i;
                smallestDiffValue = diff;
            }
            if (i == 0 || diff > largestDiffValue) {
                largestDiffIndex = i;
                largestDiffValue = diff;
            }
        }
        // Output values
        return [
            // Top-left will have the smallest sum
            corners[smallestSumIndex],
            // Top-right will have the smallest difference
            corners[smallestDiffIndex],
            // Bottom-right will have the largest sum
            corners[largestSumIndex],
            // Bottom-left will have the largest difference
            corners[largestDiffIndex],
        ];
    }


    // Scale a rectangle by a factor
    static _scaleRect(rect, scale) {
        return new DOMRectReadOnly(
            Math.floor(rect.x * scale), 
            Math.floor(rect.y * scale), 
            Math.floor(rect.width * scale), 
            Math.floor(rect.height * scale),
        );
    }

    // Scale an array of points by a factor
    static _scalePoints(points, scale) {
        return points.map(point => ({
            x: Math.floor(point.x * scale),
            y: Math.floor(point.y * scale),
        }));
    }


    // Detect rectangles
    async detect(imageBitmapSource, detectOptions = {}) {
        //console.log('RECT: detect...');

        // Wait for async startup
        await RectangleDetector.startupPromise;

        // Detection options
        const options = Object.assign(this.options, detectOptions);

        // Change of input type
        let changed = false;
        if (this.videoElement && (
            imageBitmapSource.nodeName != 'VIDEO' 
            || this.videoElement != imageBitmapSource
            || this.src.cols != this.videoElement.videoWidth
            || this.src.rows != this.videoElement.videoHeight
        )) {
            changed = true;
        }
        // TODO: Detect changes in input on non-video types

        // Changed
        if (changed) {
            console.log('RECT: Input changed parameters');
            this.src.delete();
            this.src = null;
            this.videoElement = null;
            this.videoCap = null;
        }

        // Assume video input
        if (imageBitmapSource.nodeName == 'VIDEO' && !this.videoElement) {
            this.videoElement = imageBitmapSource;
            console.log('RECT: Creating with video input: ' + this.videoElement.videoWidth + 'x' + this.videoElement.videoHeight);
            this.src = new cv.Mat(this.videoElement.videoHeight, this.videoElement.videoWidth, cv.CV_8UC4);
            // HACK: Why does OpenCV.js rely on the video .width / .height attributes?
            this.videoElement.width = this.videoElement.videoWidth;
            this.videoElement.height = this.videoElement.videoHeight;
            // Create video capture
            this.videoCap = new cv.VideoCapture(this.videoElement);
        } else {
            //console.log('RECT: WARNING: Untested input type: ' + imageBitmapSource.nodeName);
        }

        // Input
        if (this.videoElement) {
            //console.log('RECT: Video read... ' + this.src.cols + 'x' + this.src.rows);
            this.videoCap.read(this.src);
        } else {
            //console.log('RECT: Image read... ' + this.src.cols + 'x' + this.src.rows);
            this.src = cv.imread(imageBitmapSource);
        }

        // Resize
        const resizedWidth = this.options.resizedWidth;
        const resizedHeight = Math.floor(resizedWidth * this.src.rows / this.src.cols);
        if (!this.resized || this.resized.cols != resizedWidth || this.resized.rows != resizedHeight) {
            if (this.resized) {
                this.resized.delete();
            }
            this.resized = new cv.Mat(resizedHeight, resizedWidth, cv.CV_8UC4);
        }
        //console.log('RECT: Resize... ' + this.resized.cols + 'x' + this.resized.rows);
        cv.resize(this.src, this.resized, this.resized.size(), 0, 0, cv.INTER_AREA);

        // RGBA->RGB
        if (!this.rgb || this.rgb.cols != this.resized.cols || this.rgb.rows != this.resized.rows) {
            if (this.rgb) {
                this.rgb.delete();
            }
            this.rgb = new cv.Mat(this.resized.rows, this.resized.cols, cv.CV_8UC3);
        }
        //console.log('RECT: RGB... ' + this.rgb.cols + 'x' + this.rgb.rows);
        cv.cvtColor(this.resized, this.rgb, cv.COLOR_RGBA2RGB, 0);

        // Reduce noise
        const filtered = new cv.Mat();
        cv.bilateralFilter(this.rgb, filtered, 9, 75, 75, cv.BORDER_DEFAULT);       // 20, 30, 30

        // Greyscale
        if (!this.grey || this.grey.cols != filtered.cols || this.grey.rows != filtered.rows) {
            if (this.grey) {
                this.grey.delete();
            }
            this.grey = new cv.Mat(filtered.rows, filtered.cols, cv.CV_8UC1);
        }
        //console.log('RECT: Grey... ' + this.grey.cols + 'x' + this.grey.rows);
        cv.cvtColor(filtered, this.grey, cv.COLOR_RGBA2GRAY);

// Threshold
//cv.threshold(this.grey, this.grey, 200, 255, cv.THRESHZERO);    // THRESH_BINARY
//cv.adaptiveThreshold(this.grey, this.grey, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

        // Edge detection
        let edged = null;
if (1) {
        edged = new cv.Mat();
        //console.log('RECT: Canny... ');
        cv.Canny(this.grey, edged, 50, 150, 3, false);  // 10, 20
        //console.log('RECT: Canny... ' + edged.cols + 'x' + edged.rows);
}


let contours = new cv.MatVector();
let hierarchy = new cv.Mat();
// You can try more different parameters
cv.findContours(edged ? edged : this.grey, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE); // RETR_TREE / RETR_CCOMP

// Get contour data
let contourData = [];
for (let i = 0; i < contours.size(); ++i) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < options.minArea) continue;
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.05 * peri, true);
    contourData.push({
            index: i,
            area,
            peri,
            approx,
            boundingRect: cv.boundingRect(contour),
    });
}

// Filter by approximations of four-sided shapes
console.log('RECT: Contours pre-filter: ' + contourData.length);
contourData = contourData.filter((contour) => {
    console.dir(contour.approx)
    console.log('RECT: ...len: ' + contour.approx.rows);
    return contour.approx.rows == 4;
});
console.log('RECT: Contours post-filter: ' + contourData.length);

// Determine clockwise rectangle corners
for (const contour of contourData) {
    const corners = [
        { x: contour.approx.data32S[0], y: contour.approx.data32S[1] },
        { x: contour.approx.data32S[2], y: contour.approx.data32S[3] },
        { x: contour.approx.data32S[4], y: contour.approx.data32S[5] },
        { x: contour.approx.data32S[6], y: contour.approx.data32S[7] },
    ];
    contour.cornerPoints = RectangleDetector._orderPoints(corners);
}

// Sort contours by area
contourData.sort((a, b) => {
    return b.area - a.area;
}); 

// Filter contours to a maximum side ratio
console.log('RECT: Contours pre-ratio: ' + contourData.length);
contourData = contourData.filter((contour) => {
    const sideLengths = [
        Math.sqrt(Math.pow(contour.cornerPoints[0].x - contour.cornerPoints[1].x, 2) + Math.pow(contour.cornerPoints[0].y - contour.cornerPoints[1].y, 2)),
        Math.sqrt(Math.pow(contour.cornerPoints[1].x - contour.cornerPoints[2].x, 2) + Math.pow(contour.cornerPoints[1].y - contour.cornerPoints[2].y, 2)),
        Math.sqrt(Math.pow(contour.cornerPoints[2].x - contour.cornerPoints[3].x, 2) + Math.pow(contour.cornerPoints[2].y - contour.cornerPoints[3].y, 2)),
        Math.sqrt(Math.pow(contour.cornerPoints[3].x - contour.cornerPoints[0].x, 2) + Math.pow(contour.cornerPoints[3].y - contour.cornerPoints[0].y, 2)),
    ];
    const minSide = Math.min(...sideLengths);
    const maxSide = Math.max(...sideLengths);
    let ratio = null;
    if (minSide > 1) ratio = maxSide / minSide;
    console.log('RECT: ...ratio: ' + ratio);
    return ratio !== null && ratio < this.options.maxSideRatio;
});
console.log('RECT: Contours post-ratio: ' + contourData.length);


// Limit to top N contours
contourData = contourData.slice(0, 1);

// draw contours with random Scalar
const contourColors = [
    [0, 255, 0],
    [255, 0, 255],
    [255, 0, 255],
];
for (let i = 0; i < contourData.length; ++i) {
    const colorRGB = contourColors[i % contourColors.length];
    const color = new cv.Scalar(colorRGB[0], colorRGB[1], colorRGB[2]);
    cv.drawContours(this.rgb, contours, contourData[i].index, color, 1, cv.LINE_8, hierarchy, 100);
}


        // Debug output
        if (options.debug) {
            //console.log('RECT: Debug... ' + options.debug.id);
            cv.imshow(options.debug, this.rgb); // edged / this.rgb / this.grey
        }

        // Results
        const detectedRects = [];

        let scale = this.src.cols / resizedWidth;
        for (const contour of contourData) {
            detectedRects.push({
                boundingRect: RectangleDetector._scaleRect(contour.boundingRect, scale),
                cornerPoints: RectangleDetector._scalePoints(contour.cornerPoints, scale),
            });
        }

        // Clean-up
        if (this.videoElement) {
            ; // no additional clean up
        } else {
            this.src.delete();
            this.src = null;
        }
        filtered.delete();
        if (edged) edged.delete();
        contours.delete();
        hierarchy.delete();

        //console.log('RECT: ...done' + JSON.stringify(detectedRects));
        return detectedRects;
    }
    
}
