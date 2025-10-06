import type { IncomingMessage, Server, ServerResponse } from 'node:http';

const corsAnywhere: {
    createServer(options?: {
        handleInitialRequest?: (
            req: IncomingMessage,
            res: ServerResponse,
            location: { href?: string } | null
        ) => boolean | void;
        originWhitelist?: string[];
        originBlacklist?: string[];
        requireHeader?: string[];
        removeHeaders?: string[];
        redirectSameOrigin?: boolean;
        httpProxyOptions?: Record<string, unknown>;
        setHeaders?: Record<string, string>;
    }): Server;
} = require('cors-anywhere');

const PORT = 8974;
const HOST = '127.0.0.1';
const TARGET_NPM_ADVISORY_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';

const server = corsAnywhere.createServer({
    handleInitialRequest: (req, res, location) => {
        if (req.method === 'POST' && location?.href === TARGET_NPM_ADVISORY_URL) {
            req.resume();
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': '*',
            });
            res.end('{}');
            return true;
        }
        return false;
    },
    originWhitelist: [],
    requireHeader: [],
    removeHeaders: [],
    redirectSameOrigin: false,
    setHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
    },
    httpProxyOptions: {
        xfwd: false,
    },
});

server.listen(PORT, HOST, () => {
    console.log(`CORS passthrough proxy server listening on http://${HOST}:${PORT}`);
});
