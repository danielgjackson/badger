// Simple static file server with caching

import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const dirname = path.dirname(new URL(import.meta.url).pathname);

const MAX_AGE = 0;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.bin': 'application/octet-stream',
};

const serve = (req, res) => {
    try {
        // Allowed Method
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, {'Content-Type': 'text/plain'});
            res.end('405 Method Not Allowed');
            return;
        }

        // Normalized request path must strictly be within the serving directory
        const rawRequestPath = decodeURIComponent(req.url);
        let servePath = path.join(dirname, path.normalize(rawRequestPath));
        console.log(`REQUEST: ${rawRequestPath} -> ${servePath}`);
        if (!servePath.startsWith(dirname)) {
            res.writeHead(403, {'Content-Type': 'text/plain'});
            res.end('403 Forbidden');
            return;
        }

        // Redirect if path is a directory but URL does not end with a slash
        if (fs.existsSync(servePath) && fs.lstatSync(servePath).isDirectory() && !req.url.endsWith('/')) {
            console.log(`REQUEST: Redirect...`);
            res.writeHead(301, { 'Location': req.url + '/' });
            res.end();
            return;
        }

        // Internally rewrite requested path to index if it's a directory
        if (fs.existsSync(servePath) && fs.lstatSync(servePath).isDirectory()) {
            console.log(`REQUEST: Index...`);
            servePath = path.join(servePath, 'index.html');
        }

        // Determine if file doesn't exist
        if (!fs.existsSync(servePath)) {
            console.log(`REQUEST: File does not exist...`);
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end('404 Not Found');
            return;
        }

        const stats = fs.statSync(servePath);

        // Response headers
        const headers = {};

        // Response date
        headers['Date'] = (new Date()).toLocaleString("en-uk", { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: "GMT" }) + ' GMT'

        // Cache-Control
        if (MAX_AGE !== null) {
            headers['Cache-Control'] = 'public, max-age=' + MAX_AGE;
        }

        // Last-Modified
        headers['Last-Modified'] = stats.mtime.toLocaleString("en-uk", { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: "GMT" }) + ' GMT'
        // Create an ETag from the modified time and file size
        const etag = '"' + (+stats.mtime) + '-' + stats.size + '"'
        headers['ETag'] = etag;

        // Check for ETag / If-Modified-Since
        let modified = true;
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === etag) {
            modified = false;
        }
        const ifModifiedSince = req.headers['if-modified-since'];
        if (!ifNoneMatch && ifModifiedSince) {
            const modifiedSinceDate = new Date(ifModifiedSince);
            if (stats.mtime % 1000 <= modifiedSinceDate) {
                modified = false;
            }
        }
        if (!modified) {
            console.log(`REQUEST: Not Modified...`);
            res.writeHead(304, headers);
            res.end();
            return;
        }

        // MIME Type
        const ext = path.extname(servePath);
        console.log(ext);
        let mimeType = null;
        if (mimeTypes[ext]) {
            mimeType = mimeTypes[ext];
        }
        if (mimeType) {
            headers['Content-Type'] = mimeType;
        }

        // Handle HEAD request
        if (req.method === 'HEAD') {
            headers['Content-Length'] = stats.size;
            res.writeHead(200, headers);
            res.end();
            return;
        }

        // Read file
        console.log(`REQUEST: File: ${servePath}`);
        const data = fs.readFileSync(servePath);

        // Content Length
        headers['Content-Length'] = data.length;

        // Response
        res.writeHead(200, headers);
        res.end(data);
    } catch (err) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('500 Internal Server Error');
        console.error(err);
    }
}

http.createServer(serve).listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
