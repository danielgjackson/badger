// Homography calculation and image warp - Dan Jackson
// TODO: Use a 3D canvas to perspective-transform the image, rather than per-pixel 
//       (2D canvas is affine transform only?)

export class Homography {

    static transformPoint(matrix, x, y) {
        return applyProjectiveTransformToPoint(matrix, x, y);
    }

    static transformPointXY(matrix, point) {
        const transformedPoint = Homography.transformPoint(matrix, point.x, point.y);
        return { x: transformedPoint[0], y: transformedPoint[1] };
    }

    static calculateTransformFromSquares(src, dst) {
        return projectiveMatrixFromSquares(src, dst);
    }
    
    static calculateTransformFromSquaresXY(src, dst) {
        const srcSquare = [
            src[0].x, src[0].y, 
            src[1].x, src[1].y, 
            src[2].x, src[2].y, 
            src[3].x, src[3].y, 
        ];
        const dstSquare = [
            dst[0].x, dst[0].y,
            dst[1].x, dst[1].y,
            dst[2].x, dst[2].y,
            dst[3].x, dst[3].y,
        ];
        return Homography.calculateTransformFromSquares(srcSquare, dstSquare);
    }
    

    // Apply a homography to an image
    warpImage(srcImage, matrix, dstWidth, dstHeight, viewport) {
        if (!this.srcCanvas) {
            this.srcCanvas = document.createElement('canvas');
        }
        const srcWidth = srcImage.videoWidth || srcImage.width;
        const srcHeight = srcImage.videoHeight || srcImage.height;
        if (this.srcCanvas.width != srcWidth) {
            this.srcCanvas.width = srcWidth;
        }
        if (this.srcCanvas.height != srcHeight) {
            this.srcCanvas.height = srcHeight;
        }
        const ctx = this.srcCanvas.getContext('2d', { willReadFrequently: true});
        //ctx.clearRect(0, 0, this.srcCanvas.width, this.srcCanvas.height);
        ctx.drawImage(srcImage, 0, 0);
        //console.log([srcWidth, srcHeight]);
        //console.log([this.srcCanvas.width, this.srcCanvas.height]);
        const srcImageData = ctx.getImageData(0, 0, this.srcCanvas.width, this.srcCanvas.height);
        const srcImageBuffer = srcImageData.data;
        
        // Re-use dest buffer if same size
        if (!this.dstImageBuffer || this.dstImageBuffer.length != dstWidth * dstHeight * 4) {
            this.dstImageBuffer = new Uint8ClampedArray(dstWidth * dstHeight * 4);
        }

        // Apply homography
        for (let y = 0; y < dstHeight; y++) {
            for (let x = 0; x < dstWidth; x++) {
                const dstIndex = (y * dstWidth + x) * 4;

                const px = (x * viewport.width / dstWidth) + viewport.x;
                const py = (y * viewport.height / dstHeight) + viewport.y;
                const srcPoint = Homography.transformPoint(matrix, px, py);
                const sx = Math.floor(srcPoint[0]);
                const sy = Math.floor(srcPoint[1]);

                if (sx >= 0 && sx < srcImageData.width && sy >= 0 && sy < srcImageData.height) {
                    const srcIndex = (sy * srcImageData.width + sx) * 4;
                    this.dstImageBuffer[dstIndex + 0] = srcImageBuffer[srcIndex + 0];
                    this.dstImageBuffer[dstIndex + 1] = srcImageBuffer[srcIndex + 1];
                    this.dstImageBuffer[dstIndex + 2] = srcImageBuffer[srcIndex + 2];
                    this.dstImageBuffer[dstIndex + 3] = srcImageBuffer[srcIndex + 3];
                } else {
                    const c = (((x >> 4) ^ (y >> 4)) & 1) ? 0xcc : 0xaa;    // checkerboard
                    this.dstImageBuffer[dstIndex + 0] = c;
                    this.dstImageBuffer[dstIndex + 1] = c;
                    this.dstImageBuffer[dstIndex + 2] = c;
                    this.dstImageBuffer[dstIndex + 3] = 0xff;
                }
            }
        }

        // Return ImageData
        const dstImageData = new ImageData(this.dstImageBuffer, dstWidth, dstHeight);
        return dstImageData;
    }

    dataURLFromImageData(imageData) {
        if (!this.destCanvas) {
            this.destCanvas = document.createElement('canvas', { willReadFrequently: true}); // alpha: false 
        }
        if (this.destCanvas.width != imageData.width) {
            this.destCanvas.width = imageData.width;
        }
        if (this.destCanvas.height != imageData.height) {
            this.destCanvas.height = imageData.height;
        }
        const ctx = this.destCanvas.getContext('2d', { willReadFrequently: true});
        ctx.putImageData(imageData, 0, 0);
        return this.destCanvas.toDataURL();
    }

}


// ------------------------------ Functions from Homography.js ---- https://github.com/Eric-Canas/Homography.js ------
/*
MIT License

Copyright (c) 2021 Eric Cañas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export function applyProjectiveTransformToPoint(matrix, x, y){
    return [(matrix[0]*x + matrix[1]*y + matrix[2]) / (matrix[6]*x + matrix[7]*y + 1),   //x
            (matrix[3]*x + matrix[4]*y + matrix[5]) / (matrix[6]*x + matrix[7]*y + 1)]; //y
}

function projectiveMatrixFromSquares(srcSquare, dstSquare){

    const A = [[srcSquare[0], srcSquare[1], 1, 0, 0, 0, -dstSquare[0]*srcSquare[0], -dstSquare[0]*srcSquare[1]],
               [0, 0, 0, srcSquare[0], srcSquare[1], 1, -dstSquare[1]*srcSquare[0], -dstSquare[1]*srcSquare[1]],
               [srcSquare[2], srcSquare[3], 1, 0, 0, 0, -dstSquare[2]*srcSquare[2], -dstSquare[2]*srcSquare[3]],
               [0, 0, 0, srcSquare[2], srcSquare[3], 1, -dstSquare[3]*srcSquare[2], -dstSquare[3]*srcSquare[3]],
               [srcSquare[4], srcSquare[5], 1, 0, 0, 0, -dstSquare[4]*srcSquare[4], -dstSquare[4]*srcSquare[5]],
               [0, 0, 0, srcSquare[4], srcSquare[5], 1, -dstSquare[5]*srcSquare[4], -dstSquare[5]*srcSquare[5]],
               [srcSquare[6], srcSquare[7], 1, 0, 0, 0, -dstSquare[6]*srcSquare[6], -dstSquare[6]*srcSquare[7]],
               [0, 0, 0, srcSquare[6], srcSquare[7], 1, -dstSquare[7]*srcSquare[6], -dstSquare[7]*srcSquare[7]]];
    
    const H = solve(A,dstSquare,true);
    return H;
}


// ------------------------------ Functions from Numeric.js ---- https://github.com/sloisel/numeric ------
/*
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

function clone(A, k, n) {
    if (typeof k === "undefined") { k = 0; }
    if (typeof n === "undefined") { n = 1; }//numeric.sdim(A).length; }
    var i, ret = Array(A.length);
    if (k === n - 1) {
        for (i in A) { if (A.hasOwnProperty(i)) ret[i] = A[i]; }
        return ret;
    }
    for (i in A) {
        if (A.hasOwnProperty(i)) ret[i] = clone(A[i], k + 1, n);
    }
    return ret;
}

function LUsolve(LUP, b) {
    var i, j;
    var LU = LUP.LU;
    var n = LU.length;
    var x = clone(b);
    var P = LUP.P;
    var Pi, LUi, tmp;

    for (i = n - 1; i !== -1; --i) x[i] = b[i];
    for (i = 0; i < n; ++i) {
        Pi = P[i];
        if (P[i] !== i) {
            tmp = x[i];
            x[i] = x[Pi];
            x[Pi] = tmp;
        }

        LUi = LU[i];
        for (j = 0; j < i; ++j) {
            x[i] -= x[j] * LUi[j];
        }
    }

    for (i = n - 1; i >= 0; --i) {
        LUi = LU[i];
        for (j = i + 1; j < n; ++j) {
            x[i] -= x[j] * LUi[j];
        }

        x[i] /= LUi[i];
    }

    return x;
}

function LU(A, fast) {
    fast = fast || false;

    var abs = Math.abs;
    var i, j, k, absAjk, Akk, Ak, Pk, Ai;
    var max;
    var n = A.length, n1 = n - 1;
    var P = new Array(n);
    if (!fast) A = clone(A);

    for (k = 0; k < n; ++k) {
        Pk = k;
        Ak = A[k];
        max = abs(Ak[k]);
        for (j = k + 1; j < n; ++j) {
            absAjk = abs(A[j][k]);
            if (max < absAjk) {
                max = absAjk;
                Pk = j;
            }
        }
        P[k] = Pk;

        if (Pk != k) {
            A[k] = A[Pk];
            A[Pk] = Ak;
            Ak = A[k];
        }

        Akk = Ak[k];

        for (i = k + 1; i < n; ++i) {
            A[i][k] /= Akk;
        }

        for (i = k + 1; i < n; ++i) {
            Ai = A[i];
            for (j = k + 1; j < n1; ++j) {
                Ai[j] -= Ai[k] * Ak[j];
                ++j;
                Ai[j] -= Ai[k] * Ak[j];
            }
            if (j === n1) Ai[j] -= Ai[k] * Ak[j];
        }
    }

    return {
        LU: A,
        P: P
    };
}

function solve(A, b, fast) { return LUsolve(LU(A, fast), b); }

// ------------------------------
