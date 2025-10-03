import { Module } from './modules/module.js';

interface RunModuleOptions {
	code: string;
	path: string;
}
export function runModule(options: RunModuleOptions) {
	Module.runMain(options);
}

globalThis.Module = Module;

const previousFetch = globalThis.fetch;
globalThis.fetch = async (url: string, ...args: any[]) => {
	if (typeof url === 'string' && url.startsWith('https://')) {
		url = `http://127.0.0.1:8974/?${url}`;
	}

	const result = await previousFetch(url, ...args);

	// Strip content-encoding header to prevent npm from trying
	// to decompress the already-decompressed fetch() response.
	if (result.headers.has('content-encoding')) {
		const newHeaders = new Headers(result.headers);
		newHeaders.delete('content-encoding');
		
		return new Response(result.body, {
			status: result.status,
			statusText: result.statusText,
			headers: newHeaders
		});
	}
	return result;
};
