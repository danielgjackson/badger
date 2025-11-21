
export function lineIntercept(lineA, lineB) {
    const a = {
        x1: lineA.start.x,
        y1: lineA.start.y,
        x2: lineA.end.x,
        y2: lineA.end.y,
    };
    const b = {
        x1: lineB.start.x,
        y1: lineB.start.y,
        x2: lineB.end.x,
        y2: lineB.end.y,
    };
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const x3 = b.x1, y3 = b.y1, x4 = b.x2, y4 = b.y2;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (d == 0) return null;
    const xi = ((x3 - x4) * (x1 * y2 - y1 * x2) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
    const yi = ((y3 - y4) * (x1 * y2 - y1 * x2) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
    return { x: xi, y: yi };
}
