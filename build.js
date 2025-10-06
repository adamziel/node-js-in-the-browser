import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

fs.rmSync('modules', { recursive: true, force: true });
fs.mkdirSync('modules');

const entryPoints = {
	boot: './to-modularize/boot.js',
	child_process: './to-modularize/child_process.js',
	primordials: '../lib/internal/per_context/primordials.js',
	realm: '../lib/internal/bootstrap/realm.js',
	async_hooks: '../lib/async_hooks.js',
	assert: '../lib/assert.js',
	buffer: './src/buffer-polyfill.js',
	blob: '../lib/internal/blob.js',
	console: '../lib/console.js',
	constants: '../lib/constants.js',
	"internal/constants": '../lib/internal/constants.js',
	"internal/resolve": './to-modularize/resolve.js',
	'fetch-polyfill': './to-modularize/fetch-polyfill.js',
	// crypto: '../lib/crypto.js',
	crypto: './to-modularize/crypto.js',
	events: '../lib/events.js',
	errors: '../lib/internal/errors.js',
	// http: '../lib/http.js',
	http: './to-modularize/http.js',
	https: './to-modularize/http.js',
	// https: '../lib/https.js',
	fs: '../lib/fs.js',
	"fs/promises": '../lib/internal/fs/promises.js',
	os: '../lib/os.js',
	querystring: '../lib/querystring.js',
	stream: '../lib/stream.js',
	string_decoder: '../lib/string_decoder.js',
	diagnostics_channel: '../lib/diagnostics_channel.js',
	timers: '../lib/timers.js',
	'timers/promises': '../lib/timers/promises.js',
	tty: '../lib/tty.js',
	// url: '../lib/url.js',
	url: './to-modularize/url.js',
	perf_hooks: '../lib/perf_hooks.js',
	string_decoder: '../lib/string_decoder.js',
	util: '../lib/util.js',
	"util/types": '../lib/internal/util/types.js',
	"internal/types": '../lib/internal/util/types.js',
	'util/inspect': '../lib/internal/util/inspect.js',
	// zlib: '../lib/zlib.js',
	zlib: './to-modularize/zlib.js',
	'stream/web': '../lib/stream/web.js',
	vm: './to-modularize/vm.js',
	v8: './to-modularize/v8.js',
	// module: '../lib/module.js',
	// child_process: '../lib/child_process.js',
	net: '../lib/net.js',
	tls: '../lib/tls.js',
	worker_threads: '../lib/worker_threads.js',
	dns: '../lib/dns.js',
	http2: '../lib/http2.js',
	// v8: '../lib/v8.js',
	readline: '../lib/readline.js',
	'readline/promises': '../lib/readline/promises.js',
	path: '../lib/path.js',
	'path/posix': '../lib/path/posix.js',
	'path/win32': '../lib/path/win32.js',
	// 'assert/strict': '.build-tmp/assert-strict.js',
	// 'dns/promises': '.build-tmp/dns-promises.js',
	// 'util/types': '.build-tmp/util-types.js',
};


const nodePolyfillPlugin = {
	name: 'node-polyfill',
	setup(build) {
		const nodeBuiltins = Object.keys(entryPoints);
		const filter = new RegExp(`^(node:)?(${nodeBuiltins.join('|')})$`);
		build.onResolve({ filter }, (args) => {
			const modulePath = args.path.startsWith('node:')
				? args.path.slice(5)
				: args.path;
			if (entryPoints[modulePath]) {
				return { path: path.resolve(entryPoints[modulePath]) };
			}
		});
	},
};

esbuild
	.build({
		entryPoints,
		bundle: true,
		outdir: './modules',
		format: 'esm',
		platform: 'browser',
		splitting: true,
		plugins: [nodePolyfillPlugin],
		define: {
			process: 'globalThis.process',
		},
	})
	.catch(() => process.exit(1))
	.finally(() => {
		// Clean up temporary files
		fs.rmSync('.build-tmp', { recursive: true, force: true });
	});
