#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const httpProxy = require('http-proxy');
const mime = require('mime-types');

const extensionHostWorkerPatch = String.raw`
;(() => {
  if (typeof globalThis === 'undefined') {
    return;
  }
  if (globalThis.__kernelWorkerPatched) {
    return;
  }
  globalThis.__kernelWorkerPatched = true;

  const realWorker = globalThis.RealWorker || globalThis.Worker;
  if (!realWorker) {
    return;
  }
  globalThis.RealWorker = realWorker;

  const toUrlString = (value) => {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value.href === 'string') {
      return value.href;
    }
    if (value && typeof value.toString === 'function') {
      try {
        return value.toString();
      } catch {
        return '';
      }
    }
    return '';
  };

  const shouldForceModule = (targetUrl, options) => {
    if (!targetUrl) {
      return false;
    }
    if ((options?.type ?? 'classic') === 'module') {
      return true;
    }
    return targetUrl.includes('/dist/kernel/');
  };

  const createModuleBootstrapUrl = (targetUrl) => {
    const safeTarget = JSON.stringify(targetUrl);
    const code =
      '(async () => {' +
      'try { await import(' + safeTarget + '); }' +
      'catch (error) { console.error("[kernel-worker] Failed to import", ' + safeTarget + ', error); }' +
      '})();';
    return URL.createObjectURL(
      new Blob([code], { type: 'application/javascript' })
    );
  };

  const patchedWorker = function KernelPatchedWorker(url, options = {}) {
    const targetUrl = toUrlString(url);
    if (shouldForceModule(targetUrl, options)) {
      const blobUrl = createModuleBootstrapUrl(targetUrl);
      try {
        return new realWorker(blobUrl, { ...options, type: 'classic' });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    return new realWorker(url, options);
  };

  Object.setPrototypeOf(patchedWorker, realWorker);
  patchedWorker.prototype = realWorker.prototype;
  globalThis.Worker = patchedWorker;
})();
`;

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

const kernelHostDir = path.join(__dirname, 'kernel-host');

const proxy = httpProxy.createProxyServer({
	target: { host: targetHost, port: targetPort, protocol: 'http:' },
	changeOrigin: false,
	ws: true,
	xfwd: true,
	selfHandleResponse: true,
});

proxy.on('proxyReq', (proxyReq, req) => {
	proxyReq.setHeader('X-Forwarded-Proto', 'https');
	proxyReq.setHeader('X-Forwarded-Host', req.headers.host || publicHost);
});

proxy.on('proxyRes', (proxyRes, req, res) => {
	const contentType = proxyRes.headers['content-type'] || '';
	const encoding = proxyRes.headers['content-encoding'];
	const pathname = req.url ? req.url.split('?')[0] : '';

	const wantsCspHeaderPatch =
		req.method === 'GET' &&
		encoding === undefined &&
		/\btext\/html\b/i.test(contentType || '') &&
		(pathname || '').includes('webWorkerExtensionHostIframe.html');

	const wantsWorkerPatch =
		req.method === 'GET' &&
		encoding === undefined &&
		/\bjavascript\b/i.test(contentType || '') &&
		(pathname || '').includes('extensionHostWorkerMain');

	if (!wantsWorkerPatch && !wantsCspHeaderPatch) {
		res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
		proxyRes.pipe(res);
		return;
	}

	const chunks = [];
	proxyRes.on('data', (chunk) => chunks.push(chunk));
	proxyRes.on('end', () => {
		let body = Buffer.concat(chunks).toString('utf8');
		if (wantsCspHeaderPatch) {
			// Disable CSP entirely for now, JS Kernel needs the freedom to
			// run arbitrary code via import("data:...")
			body = body.replace(
				/<meta http-equiv="Content-Security-Policy" content="[^"]*"/g,
				''
			);
		} else if (
			wantsWorkerPatch &&
			!body.includes('__kernelWorkerPatched')
		) {
			if (body.includes('"use strict";')) {
				body = body.replace(
					'"use strict";',
					`"use strict";\n${extensionHostWorkerPatch}\n`
				);
			} else {
				body = `${extensionHostWorkerPatch}\n${body}`;
			}
		}
		const headers = { ...proxyRes.headers };
		headers['content-length'] = Buffer.byteLength(body);
		res.writeHead(proxyRes.statusCode || 200, headers);
		res.end(body);
	});
});

proxy.on('error', (error, req, res) => {
	const message = `HTTPS proxy error: ${error.message}`;
	console.error('[https-proxy]', message);
	if (!res.headersSent) {
		res.writeHead(502, { 'Content-Type': 'text/plain' });
	}
	res.end(message);
});

const serveKernelAsset = (req, res) => {
	const pathname = req.url ? req.url.split('?')[0] : '';
	const relative = pathname.slice('/kernel-host/'.length);
	const resolved = path.join(kernelHostDir, relative);
	const normalized = path.normalize(resolved);
	if (!normalized.startsWith(kernelHostDir) || !fs.existsSync(normalized)) {
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
		return true;
	}
	const stat = fs.statSync(normalized);
	if (stat.isDirectory()) {
		res.writeHead(403, { 'Content-Type': 'text/plain' });
		res.end('Forbidden');
		return true;
	}
	const type =
		mime.contentType(path.extname(normalized)) ||
		'application/octet-stream';
	res.writeHead(200, {
		'Content-Type': type,
		'Content-Length': stat.size,
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'require-corp',
	});
	fs.createReadStream(normalized).pipe(res);
	return true;
};

const server = https.createServer(credentials, (req, res) => {
	const pathname = req.url ? req.url.split('?')[0] : '';
	if (pathname.startsWith('/kernel-host/')) {
		serveKernelAsset(req, res);
		return;
	}
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
	console.log(
		'[https-proxy] Browsers treat *.localhost as loopback automatically.'
	);
});

function shutdown() {
	server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
