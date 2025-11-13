#!/usr/bin/env node
/**
 * Copies packages/kernel-blocks into dist/kernel-blocks.
 * Supports --watch to keep the dist folder in sync.
 */
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');

const rootPath = path.resolve(__dirname, '..');
const sourceDir = path.join(rootPath, 'packages', 'kernel-blocks');
const targetDir = path.join(rootPath, 'dist', 'kernel-blocks');
const watchMode = process.argv.includes('--watch');

const logPrefix = '[kernel-blocks]';

async function copyKernelBlocks() {
	const distRoot = path.dirname(targetDir);
	await fs.mkdir(distRoot, { recursive: true });
	const relativeTarget = path.relative(rootPath, targetDir);
	await fs.rm(targetDir, { recursive: true, force: true });
	await fs.cp(sourceDir, targetDir, {
		recursive: true,
		force: true,
		filter: (src) => !src.includes(`${path.sep}node_modules${path.sep}`),
	});
	console.log(`${logPrefix} Synced to ${relativeTarget}`);
}

async function main() {
	try {
		if (!fssync.existsSync(sourceDir)) {
			throw new Error(`Source folder missing: ${sourceDir}`);
		}

		await copyKernelBlocks();

		if (!watchMode) {
			return;
		}

		const chokidar = require('chokidar');
		let timer = null;
		const scheduleCopy = () => {
			if (timer) {
				return;
			}
			timer = setTimeout(async () => {
				timer = null;
				try {
					await copyKernelBlocks();
				} catch (error) {
					console.warn(
						`${logPrefix} Copy failed: ${error instanceof Error ? error.message : error}`
					);
				}
			}, 150);
		};

		const watcher = chokidar.watch(sourceDir, {
			ignoreInitial: true,
			persistent: true,
		});
		watcher.on('all', scheduleCopy);
		console.log(`${logPrefix} Watching for changes…`);
	} catch (error) {
		console.error(
			`${logPrefix} ${error instanceof Error ? error.message : error}`
		);
		process.exitCode = 1;
		if (!watchMode) {
			process.exit(1);
		}
	}
}

void main();
