#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const httpProxy = require('http-proxy');
const mime = require('mime-types');
const zlib = require('zlib');

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

  if(globalThis.fetch && !globalThis.realFetch) {
    globalThis.realFetch = globalThis.fetch;
  }

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
const repoRoot = path.join(__dirname, '..', '..');
const kernelDistDir = path.join(__dirname, '..', 'web-extensions', 'dist');

const applyIsolationHeaders = (headers) => {
	if (!headers['Cross-Origin-Opener-Policy']) {
		headers['Cross-Origin-Opener-Policy'] = 'same-origin';
	}
	if (!headers['Cross-Origin-Embedder-Policy']) {
		headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
	}
	return headers;
};

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
		const headers = applyIsolationHeaders({ ...proxyRes.headers });
		res.writeHead(proxyRes.statusCode || 500, headers);
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
		const headers = applyIsolationHeaders({ ...proxyRes.headers });
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

const buildCorsHeaders = (req) => {
	const origin = req.headers.origin;
	if (typeof origin === 'string' && origin.startsWith('https://')) {
		return {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Credentials': 'true',
		};
	}
	return { 'Access-Control-Allow-Origin': '*' };
};

const serveStaticFrom = (req, res, baseDir, routePrefix) => {
	const pathname = req.url ? req.url.split('?')[0] : '';
	const relative = pathname.slice(routePrefix.length);
	const resolved = path.join(baseDir, relative);
	const normalized = path.normalize(resolved);
	if (!normalized.startsWith(baseDir) || !fs.existsSync(normalized)) {
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
		...applyIsolationHeaders({}),
		...buildCorsHeaders(req),
	});
	fs.createReadStream(normalized).pipe(res);
	return true;
};

const serveKernelHostAsset = (req, res) =>
	serveStaticFrom(req, res, kernelHostDir, '/kernel-host/');

const serveKernelDistAsset = (req, res) =>
	serveStaticFrom(req, res, kernelDistDir, '/kernel/');

const handleCorsProxy = (req, res) => {
	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		res.writeHead(200, {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': '*',
			'access-control-allow-headers': '*',
			'access-control-max-age': '86400',
		});
		res.end();
		return true;
	}

	const url = new URL(req.url, `https://${req.headers.host}`);
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		res.end('Missing url parameter');
		return true;
	}

	let parsedTarget;
	try {
		parsedTarget = new URL(targetUrl);
	} catch (error) {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		res.end(`Invalid URL: ${error.message}`);
		return true;
	}

	// Use the appropriate protocol module
	const protocol =
		parsedTarget.protocol === 'https:' ? require('https') : require('http');

	// Filter headers similar to PHP proxy
	// Strictly disallowed headers
	const strictlyDisallowedHeaders = [
		// Drop the incoming Host header because it identifies the
		// proxy server, not the target server.
		'host',
		// Don't pass accept-encoding header to the target server.
		// Fetch() in the browser already handles encoding, we don't
		// want the minipass-fetch code to get confused and try
		// double unzipping.
		'accept-encoding',
	];

	const forwardHeaders = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (!strictlyDisallowedHeaders.includes(key.toLowerCase())) {
			forwardHeaders[key] = value;
		}
	}
	forwardHeaders.host = parsedTarget.host;

	const proxyReq = protocol.request(
		{
			hostname: parsedTarget.hostname,
			port: parsedTarget.port,
			path: parsedTarget.pathname + parsedTarget.search,
			method: req.method,
			headers: forwardHeaders,
		},
		(proxyRes) => {
			// Filter response headers similar to PHP proxy
			const responseHeaders = {};
			const encoding = proxyRes.headers['content-encoding'];

			for (const [key, value] of Object.entries(proxyRes.headers)) {
				const lowerKey = key.toLowerCase();

				// Skip headers that shouldn't be relayed
				if (
					// Skip CORS headers - we'll add our own
					lowerKey === 'access-control-allow-origin' ||
					lowerKey === 'access-control-allow-credentials' ||
					lowerKey === 'access-control-allow-methods' ||
					lowerKey === 'access-control-allow-headers' ||
					// Skip content-encoding since we're decompressing
					lowerKey === 'content-encoding' ||
					// Skip content-length since it won't match after decompression
					lowerKey === 'content-length'
				) {
					continue;
				}

				responseHeaders[key] = value;
			}

			// Add CORS headers to allow any origin
			responseHeaders['access-control-allow-origin'] = '*';
			responseHeaders['access-control-allow-methods'] = '*';
			responseHeaders['access-control-allow-headers'] = '*';
			responseHeaders['access-control-expose-headers'] = '*';

			// Add cache control (matching PHP proxy)
			responseHeaders['cache-control'] = 'no-cache';
			responseHeaders['x-cache'] = 'MISS';

			res.writeHead(proxyRes.statusCode || 200, responseHeaders);

			// Decompress if needed, otherwise pipe directly
			let stream = proxyRes;
			if (encoding === 'gzip') {
				stream = proxyRes.pipe(zlib.createGunzip());
			} else if (encoding === 'deflate') {
				stream = proxyRes.pipe(zlib.createInflate());
			} else if (encoding === 'br') {
				stream = proxyRes.pipe(zlib.createBrotliDecompress());
			}

			stream.pipe(res);
		}
	);

	proxyReq.on('error', (error) => {
		console.error('[https-proxy] CORS proxy error:', error.message);
		if (!res.headersSent) {
			res.writeHead(502, { 'Content-Type': 'text/plain' });
		}
		res.end(`Proxy error: ${error.message}`);
	});

	// Forward request body
	req.pipe(proxyReq);
	return true;
};

const server = https.createServer(credentials, (req, res) => {
	const fullUrl = new URL(
		req.url || '/',
		`https://${req.headers.host || `${publicHost}:${publicPort}`}`
	);
	if (
		fullUrl.pathname === '/' &&
		!fullUrl.searchParams.has('vscode-coi') &&
		(fullUrl.searchParams.has('folder') ||
			fullUrl.searchParams.has('payload'))
	) {
		fullUrl.searchParams.set('vscode-coi', '3');
		res.writeHead(307, { Location: fullUrl.toString() });
		res.end();
		return;
	}

	const pathname = fullUrl.pathname;
	if (pathname.startsWith('/proxy/')) {
		handleCorsProxy(req, res);
		return;
	}
	if (pathname.startsWith('/kernel-host/')) {
		serveKernelHostAsset(req, res);
		return;
	}
	if (pathname.startsWith('/kernel/')) {
		serveKernelDistAsset(req, res);
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
