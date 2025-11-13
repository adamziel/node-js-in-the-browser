#!/usr/bin/env node

const { spawn } = require('child_process');

const url =
	process.env.VSCODE_DEV_URL || 'https://vscode.localhost:4443/?vscode-coi=3';
const delayMs = Number(process.env.VSCODE_DEV_OPEN_DELAY_MS || '5000');

function openUrl(target) {
	const platform = process.platform;
	if (platform === 'darwin') {
		return spawn('open', [target], {
			stdio: 'ignore',
			detached: true,
		}).unref();
	}
	if (platform === 'win32') {
		return spawn('cmd', ['/c', 'start', '', target], {
			stdio: 'ignore',
			detached: true,
		}).unref();
	}
	return spawn('xdg-open', [target], {
		stdio: 'ignore',
		detached: true,
	}).unref();
}

console.log(`[open-vscode] Will open ${url} in ${delayMs}ms...`);
setTimeout(() => {
	try {
		openUrl(url);
		console.log('[open-vscode] Browser launch triggered.');
	} catch (error) {
		console.error('[open-vscode] Failed to open browser:', error.message);
	}
}, delayMs);
