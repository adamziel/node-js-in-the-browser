import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

const PORT = 8974;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
        const requestedHeaders = req.headers['access-control-request-headers'];
        if (requestedHeaders) {
            res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
        }
        res.setHeader('Access-Control-Max-Age', 86400); // 24 hours
        res.writeHead(204);
        res.end();
        return;
    }

    const requestUrl = req.url;
    if (!requestUrl || !requestUrl.startsWith('/?')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid request format. Use /?{URL}');
        return;
    }

    const urlString = decodeURIComponent(requestUrl.substring(2));

    if (!urlString) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Please provide a URL to proxy.');
        return;
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(urlString);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid URL provided.');
        return;
    }

    const protocol = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: { ...req.headers },
    };

    // The host header is forwarded from the original request,
    // we need to override it with the target's host.
    options.headers.host = targetUrl.host;
    // Let's delete other headers that could cause issues
    delete options.headers['origin'];
    delete options.headers['referer'];
    
    const proxyReq = protocol(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers['access-control-allow-origin'] = '*';
        const exposedHeaders = Object.keys(headers).join(', ');
        headers['access-control-expose-headers'] = exposedHeaders;
        
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', (e) => {
        console.error(`Proxy request error: ${e.message}`);
        res.writeHead(502);
        res.end('Bad Gateway');
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`CORS passthrough proxy server listening on http://127.0.0.1:${PORT}`);
});
