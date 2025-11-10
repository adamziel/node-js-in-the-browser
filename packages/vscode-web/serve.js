#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3847;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
	let filePath = path.join(
		DIST_DIR,
		req.url === '/' ? 'index.html' : req.url
	);

	// Security: prevent directory traversal
	if (!filePath.startsWith(DIST_DIR)) {
		res.writeHead(403);
		res.end('Forbidden');
		return;
	}

	const extname = path.extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[extname] || 'application/octet-stream';

	fs.readFile(filePath, (error, content) => {
		if (error) {
			if (error.code === 'ENOENT') {
				res.writeHead(404);
				res.end('File not found');
			} else {
				res.writeHead(500);
				res.end(`Server error: ${error.code}`);
			}
		} else {
			res.writeHead(200, { 'Content-Type': contentType });
			res.end(content, 'utf-8');
		}
	});
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`VS Code Web is running at:`);
	console.log(`  Local:   http://localhost:${PORT}`);
	console.log(`  Network: http://127.0.0.1:${PORT}`);
	console.log(`\nServing files from: ${DIST_DIR}`);
	console.log(`\nPress Ctrl+C to stop`);
});
