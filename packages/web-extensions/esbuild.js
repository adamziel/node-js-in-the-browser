const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs/promises');

const watch = process.argv.includes('--watch');
const chokidar = watch ? require('chokidar') : null;

const extensionDistPath = path.resolve(__dirname, 'dist');
const workspaceKernelDistPath = path.resolve(__dirname, '../../dist/kernel');
const workspaceKernelNodeJsDistPath = path.resolve(
	__dirname,
	'../../dist/kernel-node-js'
);
const workspaceKernelBlocksDistPath = path.resolve(
	__dirname,
	'../../dist/kernel-blocks'
);
const workspaceKernelHelpers = [
	{
		label: 'lib',
		source: path.resolve(__dirname, '../../dist/lib'),
		target: path.join(extensionDistPath, 'lib'),
	},
	{
		label: 'util',
		source: path.resolve(__dirname, '../../dist/util'),
		target: path.join(extensionDistPath, 'util'),
	},
	{
		label: 'shell',
		source: path.resolve(__dirname, '../../dist/shell'),
		target: path.join(extensionDistPath, 'shell'),
	},
];

const artifactTargets = [
	{
		label: 'kernel',
		source: workspaceKernelDistPath,
		target: path.join(extensionDistPath, 'kernel'),
	},
	{
		label: 'kernel-node-js',
		source: workspaceKernelNodeJsDistPath,
		target: path.join(extensionDistPath, 'kernel-node-js'),
	},
	...workspaceKernelHelpers,
	{
		label: 'kernel-blocks',
		source: workspaceKernelBlocksDistPath,
		target: path.join(extensionDistPath, 'kernel-blocks'),
	},
];

const missingArtifacts = new Set();

async function copyArtifact({ label, source, target }) {
	try {
		await fs.access(source);
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			if (!missingArtifacts.has(source)) {
				console.warn(
					`Warning: ${label} source not found at ${source}. Build that package first.`
				);
				missingArtifacts.add(source);
			}
			return;
		}
		throw error;
	}

	missingArtifacts.delete(source);
	await fs.rm(target, { recursive: true, force: true });
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.cp(source, target, { recursive: true, force: true });
	console.log(`Copied ${label} into extension bundle`);
}

async function syncKernelArtifacts() {
	for (const artifact of artifactTargets) {
		await copyArtifact(artifact);
	}
}

const createCopyScheduler = () => {
	let timer = null;
	return () => {
		if (timer) {
			return;
		}
		timer = setTimeout(async () => {
			timer = null;
			try {
				await syncKernelArtifacts();
			} catch (error) {
				console.warn(
					'Warning: Failed to sync kernel assets:',
					error instanceof Error ? error.message : error
				);
			}
		}, 200);
	};
};

const startArtifactWatcher = (scheduleCopy) => {
	if (!chokidar) {
		return;
	}
	const sources = artifactTargets.map((artifact) => artifact.source);
	const watcher = chokidar.watch(sources, {
		ignoreInitial: true,
		persistent: true,
	});
	watcher.on('all', scheduleCopy);
	console.log('Watching kernel build outputs for changes…');
	return watcher;
};

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
		],
	})
	.then(async (ctx) => {
		if (watch) {
			await ctx.watch({
				async onRebuild(error) {
					if (error) {
						console.error('Extension rebuild failed:', error);
						return;
					}
					await syncKernelArtifacts();
				},
			});
			await syncKernelArtifacts();
			const scheduleCopy = createCopyScheduler();
			startArtifactWatcher(scheduleCopy);
			console.log('Watching for changes...');
		} else {
			await ctx.rebuild();
			await syncKernelArtifacts();
			await ctx.dispose();
			console.log('Build complete!');
		}
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
