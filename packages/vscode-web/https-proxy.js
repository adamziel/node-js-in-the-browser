#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const httpProxy = require('http-proxy');

const targetHost = process.env.VSCODE_WEB_TARGET_HOST || '127.0.0.1';
const targetPort = Number(process.env.VSCODE_WEB_TARGET_PORT || '3958');
const sslHost = process.env.VSCODE_WEB_SSL_BIND || '0.0.0.0';
const publicHost = process.env.VSCODE_WEB_SSL_HOST || 'vscode.localhost';
const publicPort = Number(process.env.VSCODE_WEB_SSL_PORT || '4443');
const certPath =
	process.env.VSCODE_WEB_SSL_CERT_PATH ||
	path.join(__dirname, 'certs', 'vscode.localhost.pem');
const keyPath =
	process.env.VSCODE_WEB_SSL_KEY_PATH ||
	path.join(__dirname, 'certs', 'vscode.localhost-key.pem');

function ensureFile(filePath, label) {
	if (!fs.existsSync(filePath)) {
		console.error(`[https-proxy] Missing ${label}: ${filePath}`);
		console.error(
			'[https-proxy] Generate one with mkcert or point VSCODE_WEB_SSL_CERT_PATH/VSCODE_WEB_SSL_KEY_PATH elsewhere.'
		);
		process.exit(1);
	}
	return fs.readFileSync(filePath);
}

const credentials = {
	cert: ensureFile(certPath, 'certificate'),
	key: ensureFile(keyPath, 'private key'),
};

const proxy = httpProxy.createProxyServer({
	target: { host: targetHost, port: targetPort, protocol: 'http:' },
	changeOrigin: false,
	ws: true,
	xfwd: true,
});

proxy.on('proxyReq', (proxyReq, req) => {
	proxyReq.setHeader('X-Forwarded-Proto', 'https');
	proxyReq.setHeader('X-Forwarded-Host', req.headers.host || publicHost);
});

proxy.on('proxyRes', (proxyRes) => {
	proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin';
	proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
	proxyRes.headers['Cross-Origin-Resource-Policy'] = 'same-origin';
});

proxy.on('error', (error, req, res) => {
	const message = `HTTPS proxy error: ${error.message}`;
	console.error('[https-proxy]', message);
	if (!res.headersSent) {
		res.writeHead(502, { 'Content-Type': 'text/plain' });
	}
	res.end(message);
});

const server = https.createServer(credentials, (req, res) => {
	proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
	proxy.ws(req, socket, head);
});

server.listen(publicPort, sslHost, () => {
	console.log(
		`[https-proxy] HTTPS listening on https://${publicHost}:${publicPort} (bound to ${sslHost})`
	);
	console.log(
		`[https-proxy] Forwarding to http://${targetHost}:${targetPort}`
	);
	console.log('[https-proxy] Browsers treat *.localhost as loopback automatically.');
});

function shutdown() {
	server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
