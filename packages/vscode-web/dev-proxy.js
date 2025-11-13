#!/usr/bin/env node

/**
 * Development wrapper for https-proxy.js that restarts the proxy
 * whenever its source file (or supporting assets) change.
 */

const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

const proxyScript = path.join(__dirname, 'https-proxy.js');
const kernelHostDir = path.join(__dirname, 'kernel-host');
const watchPaths = [proxyScript, kernelHostDir];

let proxyProcess = null;
let restarting = false;

const startProxy = () => {
	if (proxyProcess) {
		return;
	}
	proxyProcess = spawn('node', [proxyScript], {
		stdio: 'inherit',
		env: process.env,
	});
	proxyProcess.on('exit', (code, signal) => {
		const label = '[https-proxy]';
		if (restarting) {
			restarting = false;
			proxyProcess = null;
			startProxy();
			return;
		}
		console.log(
			label,
			`Proxy exited (${signal || code}). Waiting for file changes to restart...`
		);
		proxyProcess = null;
	});
};

const restartProxy = (reason) => {
	const label = '[https-proxy]';
	if (proxyProcess) {
		console.log(label, `Restarting due to ${reason}...`);
		restarting = true;
		proxyProcess.kill('SIGTERM');
	} else {
		console.log(label, `Starting proxy due to ${reason}...`);
		startProxy();
	}
};

const watcher = chokidar.watch(watchPaths, {
	ignoreInitial: true,
	ignorePermissionErrors: true,
});

watcher.on('all', (event, filePath) => {
	const relative = path.relative(process.cwd(), filePath);
	restartProxy(`${event} in ${relative}`);
});

const cleanup = () => {
	watcher.close().catch(() => undefined);
	if (proxyProcess) {
		proxyProcess.kill('SIGTERM');
	}
};

process.on('SIGINT', () => {
	cleanup();
	process.exit(0);
});
process.on('SIGTERM', () => {
	cleanup();
	process.exit(0);
});

startProxy();
