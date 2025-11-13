import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		// Main kernel entry point
		index: 'runtime/index.ts',
		// Worker entry points that are spawned dynamically
		'workers/process-controller': 'runtime/process/child/controller.ts',
		'workers/pump-worker': 'runtime/ipc/sync/pump-worker.ts',
		'workers/wasmfs-worker': 'runtime/wasmfs-worker.ts',
		'lib/utils': 'runtime/busybox/lib/utils.ts',
		'shell/run': 'runtime/shell/run.ts',
		'shell/sh': 'runtime/shell/sh.ts',
		'util/paths': 'runtime/util/paths.ts',
	},
	format: ['esm'],
	dts: false, // Disable type declarations for now due to type errors
	sourcemap: false, // Disable sourcemaps to avoid source-map library issues
	clean: true,
	outDir: '../../dist/kernel',
	splitting: false,
	treeshake: true,
	bundle: true,
	external: [],
	loader: {
		'.wasm': 'copy',
	},
	skipNodeModulesBundle: true,
	esbuildOptions(options) {
		options.target = 'esnext';
		options.platform = 'browser';
		options.banner = {
			js: '// @adamziel/kernel - Browser-based POSIX-like kernel environment',
		};
	},
	// Copy WASM files and shell flash assets from runtime to dist
	onSuccess: async () => {
		const fs = await import('fs/promises');
		const path = await import('path');

		// Copy WASMFS files
		const wasmfsDistDir = path.resolve('runtime/wasmfs-dist');
		const kernelDistDir = path.resolve('../../dist/kernel');
		const rootDistDir = path.resolve('../../dist');

		try {
			const files = await fs.readdir(wasmfsDistDir);
			for (const file of files) {
				if (file.endsWith('.wasm') || file.endsWith('.js')) {
					await fs.copyFile(
						path.join(wasmfsDistDir, file),
						path.join(kernelDistDir, file)
					);
					console.log(`Copied ${file} to dist/`);
				}
			}
		} catch (error) {
			console.error('Failed to copy WASM files:', error);
		}

		// Copy Flash shell WASM files
		const flashPkgDir = path.resolve('runtime/shell/flash/pkg');
		try {
			const flashFiles = await fs.readdir(flashPkgDir);
			for (const file of flashFiles) {
				if (file.endsWith('.wasm')) {
					await fs.copyFile(
						path.join(flashPkgDir, file),
						path.join(kernelDistDir, file)
					);
					console.log(`Copied ${file} to dist/`);
				}
			}
		} catch (error) {
			console.error('Failed to copy Flash WASM files:', error);
		}

		const helperMappings = [
			{ from: path.join(kernelDistDir, 'lib', 'utils.js'), to: path.join(rootDistDir, 'lib', 'utils.js') },
			{ from: path.join(kernelDistDir, 'util', 'paths.js'), to: path.join(rootDistDir, 'util', 'paths.js') },
			{ from: path.join(kernelDistDir, 'shell', 'run.js'), to: path.join(rootDistDir, 'shell', 'run.js') },
			{ from: path.join(kernelDistDir, 'shell', 'sh.js'), to: path.join(rootDistDir, 'shell', 'sh.js') },
			{ from: path.join(kernelDistDir, 'flash_wasm_demo_bg.wasm'), to: path.join(rootDistDir, 'shell', 'flash_wasm_demo_bg.wasm') },
		];
		for (const mapping of helperMappings) {
			try {
				await fs.mkdir(path.dirname(mapping.to), { recursive: true });
				await fs.copyFile(mapping.from, mapping.to);
				console.log(`Mirrored ${mapping.from} -> ${mapping.to}`);
			} catch (error) {
				if (error && error.code !== 'ENOENT') {
					console.warn('Failed to mirror helper module', mapping.from, error);
				}
			}
		}
	},
});
