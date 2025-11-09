import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const ctx = esbuild
	.context({
		entryPoints: ['./src/extension.ts'],
		bundle: true,
		outfile: './dist/extension.js',
		external: ['vscode'],
		format: 'esm',
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
		// Resolve kernel package from the workspace
		alias: {
			'@adamziel/kernel': path.resolve(__dirname, '../kernel'),
		},
		// Copy WASM files from kernel dist to extension dist
		plugins: [
			{
				name: 'copy-wasm-files',
				setup(build) {
					build.onEnd(async () => {
						const fs = await import('fs/promises');
						const kernelDistPath = path.resolve(
							__dirname,
							'../../dist/kernel'
						);
						const extensionDistPath = path.resolve(
							__dirname,
							'./dist'
						);

						try {
							// Ensure extension dist exists
							await fs.mkdir(extensionDistPath, {
								recursive: true,
							});

							// Copy WASM files from kernel dist
							const files = await fs.readdir(kernelDistPath);
							for (const file of files) {
								if (file.endsWith('.wasm')) {
									await fs.copyFile(
										path.join(kernelDistPath, file),
										path.join(extensionDistPath, file)
									);
									console.log(
										`Copied ${file} to extension dist/`
									);
								}
							}
						} catch (error) {
							if (error.code !== 'ENOENT') {
								console.warn(
									'Warning: Could not copy WASM files:',
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
