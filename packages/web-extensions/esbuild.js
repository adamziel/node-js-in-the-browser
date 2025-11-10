const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs/promises');

const watch = process.argv.includes('--watch');
const extensionDistPath = path.resolve(__dirname, 'dist');
const workspaceKernelDistPath = path.resolve(__dirname, '../../dist/kernel');

const ctx = esbuild
	.context({
		entryPoints: ['./src/extension.ts'],
		bundle: true,
		outfile: path.join(extensionDistPath, 'extension.js'),
		external: ['vscode'],
		format: 'cjs',
		platform: 'browser',
		target: 'es2022',
		sourcemap: watch,
		minify: !watch,
		define: {
			'process.env.NODE_ENV': watch ? '"development"' : '"production"',
		},
		logLevel: 'info',
		loader: {
			'.wasm': 'file',
		},
		plugins: [
			{
				name: 'prepare-dist-folders',
				setup(build) {
					build.onStart(async () => {
						await fs.mkdir(extensionDistPath, { recursive: true });
					});
				},
			},
		{
			name: 'copy-kernel-dist',
			setup(build) {
				build.onEnd(async () => {
					try {
						const targetKernelDist = path.join(
							extensionDistPath,
							'kernel'
						);
						await fs.rm(targetKernelDist, { recursive: true, force: true });
						await fs.cp(workspaceKernelDistPath, targetKernelDist, {
							recursive: true,
						});
						console.log('Copied kernel dist/ into extension bundle');
					} catch (error) {
						if (error.code !== 'ENOENT') {
							console.warn(
								'Warning: Could not copy kernel dist:',
								error.message
							);
						}
					}
				});
			},
		},
		],
	})
	.then(async (ctx) => {
		if (watch) {
			await ctx.watch();
			console.log('Watching for changes...');
		} else {
			await ctx.rebuild();
			await ctx.dispose();
			console.log('Build complete!');
		}
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
