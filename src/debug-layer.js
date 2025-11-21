
export class DebugLayer {

    constructor (elem) {
        this.elem = elem;
        this.canvasSize = [1, 1];
        this.elemSize = [1, 1];

        // Create a sibling canvas element after the video element
        this.canvasElem = document.createElement('canvas');
        this.elem.parentNode.insertBefore(this.canvasElem, this.elem.nextSibling);

        // Canvas resize
        let resizing = false;
        const ro = new ResizeObserver(entries => {
            if (resizing) return;
            resizing = true;
            setInterval(() => {
                //for (let entry of entries) { entry.target }
                const ctx = this.canvasElem.getContext('2d');
                this.elemSize = [
                    this.elem.videoWidth || this.elem.naturalWidth || 1,
                    this.elem.videoHeight || this.elem.naturalHeight || 1,
                ];
                this.canvasSize = [
                    Math.round(this.elem.clientWidth * window.devicePixelRatio), 
                    Math.round(this.elem.clientHeight * window.devicePixelRatio),
                ];
                if (ctx.canvas.width != this.canvasSize[0] || ctx.canvas.height != this.canvasSize[1]) {
                    ctx.canvas.width = this.canvasSize[0];
                    ctx.canvas.height = this.canvasSize[1];
                    //ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    console.log('Resize ' + this.elem.nodeName + ': [' + this.canvasSize.join(', ') + '] -> [' + this.elemSize.join(', ') + ']');
                }
                resizing = false;
            }, 10);
        });
        ro.observe(this.elem);
    }

    debugScale(point) {
        if (!point) {
            console.log('ERROR: Invalid point - debugScale()');
            return { x: 0, y: 0 };
        }
        return {
            x: Math.floor(point.x * this.canvasSize[0] / this.elemSize[0]),
            y: Math.floor(point.y * this.canvasSize[1] / this.elemSize[1]),
        };
    }

    debugClear() {
        const ctx = this.canvasElem.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    debugDraw(start, end, color = 'white') {
        start = this.debugScale(start);
        end = this.debugScale(end);
        const ctx = this.canvasElem.getContext('2d');
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.closePath();
    }

    debugDrawQuad(points, color = 'white') {
        this.debugDraw(points[0], points[1], color);
        this.debugDraw(points[1], points[2], color);
        this.debugDraw(points[2], points[3], color);
        this.debugDraw(points[3], points[0], color);

        if (true) {
            this.debugDrawText(points[0], '0', 'black', '8px sans-serif');
            this.debugDrawText(points[1], '1', 'black', '8px sans-serif');
            this.debugDrawText(points[2], '2', 'black', '8px sans-serif');
            this.debugDrawText(points[3], '3', 'black', '8px sans-serif');
        }
    }

    debugDrawRect(rect, color = 'white') {
        this.debugDrawQuad([
            { x: rect.left, y: rect.top },
            { x: rect.left + rect.width, y: rect.top },
            { x: rect.left + rect.width, y: rect.top + rect.height },
            { x: rect.left, y: rect.top + rect.height },
        ], color);
    }

    debugDrawText(point, text, color = 'white', font = '16px sans-serif') {
        point = this.debugScale(point);
        const ctx = this.canvasElem.getContext('2d');
        ctx.fillStyle = color;
        ctx.font = font;
        const textSize = ctx.measureText(text);
        ctx.fillText(text, point.x - textSize.width / 2, point.y + textSize.actualBoundingBoxAscent / 2);
    }

}
