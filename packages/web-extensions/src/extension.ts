import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';
import { KernelFileSystemProvider } from './kernelFileSystemProvider';
import { KernelTerminalProvider } from './kernelTerminalProvider';
import { KernelGitProvider } from './gitProvider';
import { GitSourceControl } from './gitSourceControl';
import type * as KernelModule from '@adamziel/kernel';
import { onDidLoadKernel } from './on-did-kernel-load';

let kernelManager: KernelManager;
let fsProvider: KernelFileSystemProvider;
let terminalProvider: KernelTerminalProvider;
let gitProvider: KernelGitProvider;
let gitSourceControl: GitSourceControl;
let playgroundPanel: vscode.WebviewPanel | null = null;
let playgroundStatusBarItem: vscode.StatusBarItem | null = null;

let kernelModulePromise: Promise<KernelModule> | null = null;
function loadKernelModule(
	context: vscode.ExtensionContext
): Promise<KernelModule> {
	if (!kernelModulePromise) {
		const kernelUri = vscode.Uri.joinPath(
			context.extensionUri,
			'dist',
			'kernel',
			'index.js'
		);
		const kernelUrl = kernelUri.toString(true);
		kernelModulePromise = import(
			/* @vite-ignore */ /* webpackIgnore: true */ kernelUrl
		) as Promise<KernelModule>;
	}

	return kernelModulePromise;
}

let nodeModulePromise: Promise<any> | null = null;
async function loadNodeJsInstaller(
	context: vscode.ExtensionContext
): Promise<any> {
	if (!nodeModulePromise) {
		const nodeModuleUri = vscode.Uri.joinPath(
			context.extensionUri,
			'dist',
			'kernel-node-js',
			'index.js'
		);
		nodeModulePromise = import(
			/* @vite-ignore */ /* webpackIgnore: true */ nodeModuleUri.toString(
				true
			)
		) as Promise<any>;
	}
	return await nodeModulePromise;
}

export async function activate(context: vscode.ExtensionContext) {
	console.log('Kernel VS Code extension is activating...');
	try {
		const kernelModule = await loadKernelModule(context);

		const workersBase = vscode.Uri.joinPath(
			context.extensionUri,
			'dist',
			'kernel',
			'workers'
		);
		kernelModule.setWorkerConfig?.({
			processController: vscode.Uri.joinPath(
				workersBase,
				'process-controller.js'
			).toString(true),
			pumpWorker: vscode.Uri.joinPath(
				workersBase,
				'pump-worker.js'
			).toString(true),
			wasmfsWorker: vscode.Uri.joinPath(
				workersBase,
				'wasmfs-worker.js'
			).toString(true),
		});
		kernelManager = new KernelManager(
			kernelModule.Kernel,
			kernelModule.installBusybox
		);

		// Initialize the kernel
		await kernelManager.initialize();
		console.log('Kernel initialized successfully');

		const nodeInstaller = await loadNodeJsInstaller(context);
		await nodeInstaller.installNodeJs(kernelManager.getKernel());

		// Register filesystem provider
		fsProvider = new KernelFileSystemProvider(kernelManager);
		context.subscriptions.push(
			vscode.workspace.registerFileSystemProvider('kernel', fsProvider, {
				isCaseSensitive: true,
				isReadonly: false,
			})
		);
		console.log('Kernel filesystem provider registered');

		// Register terminal provider
		terminalProvider = new KernelTerminalProvider(kernelManager);
		context.subscriptions.push(
			vscode.window.registerTerminalProfileProvider(
				'kernel.terminal',
				terminalProvider
			)
		);
		console.log('Kernel terminal provider registered');

		await ensureKernelTerminalDefault();

		// Register Git provider (commands)
		gitProvider = new KernelGitProvider(kernelManager, context);
		gitProvider.registerCommands(context);
		await gitProvider.restoreLastRemoteRepository();
		console.log('Kernel Git provider registered');

		// Register Git Source Control
		gitSourceControl = new GitSourceControl(kernelManager);
		gitSourceControl.registerCommands(context);
		await gitSourceControl.initialize();
		console.log('Git Source Control provider registered');

		// Register commands
		context.subscriptions.push(
			vscode.commands.registerCommand('kernel.openTerminal', async () => {
				const terminal = await terminalProvider.createTerminal();
				terminal.show();
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('kernel.restart', async () => {
				await kernelManager.restart();
				vscode.window.showInformationMessage(
					'Kernel restarted successfully'
				);
			})
		);

		vscode.window.showInformationMessage(
			'JavaScript Kernel extension activated!'
		);

		ensureKernelWorkspaceFolder();
		initializePlaygroundPreview(context);

		// Optionally auto-open a terminal on first activation
		const config = vscode.workspace.getConfiguration('kernel');
		if (config.get('autoOpenTerminal', false)) {
			vscode.commands.executeCommand('kernel.openTerminal');
		}

		onDidLoadKernel(context, kernelManager);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(
			`Failed to activate Kernel extension: ${message}`
		);
		console.error('Kernel activation error:', error);
		throw error;
	}
}

export function deactivate() {
	console.log('Kernel VS Code extension is deactivating...');

	if (playgroundPanel) {
		playgroundPanel.dispose();
		playgroundPanel = null;
	}

	if (playgroundStatusBarItem) {
		playgroundStatusBarItem.dispose();
		playgroundStatusBarItem = null;
	}

	if (gitSourceControl) {
		gitSourceControl.dispose();
	}

	if (gitProvider) {
		gitProvider.dispose();
	}

	if (terminalProvider) {
		terminalProvider.dispose();
	}

	if (fsProvider) {
		fsProvider.dispose();
	}

	if (kernelManager) {
		kernelManager.dispose();
	}
}

function ensureKernelWorkspaceFolder() {
	const existing = vscode.workspace.workspaceFolders || [];
	const alreadyAdded = existing.some(
		(folder) => folder.uri.scheme === 'kernel'
	);
	if (alreadyAdded) {
		return;
	}
	vscode.workspace.updateWorkspaceFolders(0, 0, {
		uri: vscode.Uri.parse('kernel:/'),
		name: 'Kernel FS',
	});
}

async function ensureKernelTerminalDefault() {
	const hasKernelTerminal = vscode.window.terminals.some(
		(terminal) => terminal.name === 'Kernel Shell'
	);
	if (hasKernelTerminal) {
		vscode.window.terminals
			.find((terminal) => terminal.name === 'Kernel Shell')
			?.show();
		return;
	}

	if (terminalProvider) {
		const terminal = await terminalProvider.createTerminal();
		terminal.show(true);
		return;
	}

	try {
		await vscode.commands.executeCommand(
			'workbench.action.terminal.newWithProfile',
			{ profileName: 'Kernel Shell' }
		);
	} catch (error) {
		console.warn('Kernel: unable to launch terminal profile', error);
	}
}

function initializePlaygroundPreview(context: vscode.ExtensionContext) {
	if (!playgroundStatusBarItem) {
		playgroundStatusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		playgroundStatusBarItem.text = '$(browser) Playground Preview';
		playgroundStatusBarItem.tooltip =
			'Open the WordPress Playground preview';
		playgroundStatusBarItem.command = 'kernel.openPlaygroundPreview';
		playgroundStatusBarItem.show();
		context.subscriptions.push(playgroundStatusBarItem);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('kernel.openPlaygroundPreview', () => {
			openPlaygroundPreview(context);
		})
	);

	openPlaygroundPreview(context);
}

function openPlaygroundPreview(context: vscode.ExtensionContext) {
	if (playgroundPanel) {
		playgroundPanel.reveal(undefined, true);
		return;
	}

	playgroundPanel = vscode.window.createWebviewPanel(
		'kernel.playgroundPreview',
		'Playground Preview',
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
		{
			enableScripts: true,
			retainContextWhenHidden: true,
		}
	);
	playgroundPanel.webview.html = getPlaygroundPreviewHtml();
	context.subscriptions.push(playgroundPanel);
	playgroundPanel.onDidDispose(
		() => {
			playgroundPanel = null;
		},
		null,
		context.subscriptions
	);
}

function getPlaygroundPreviewHtml() {
	const playgroundUrl = 'https://playground.wordpress.net';
	return /* html */ `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Playground Preview</title>
		<style>
			:root {
				color-scheme: light dark;
			}
			html,
			body {
				width: 100%;
				height: 100%;
				padding: 0;
				margin: 0;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			}
			body {
				display: flex;
				flex-direction: column;
				background: var(--vscode-editor-background, #1e1e1e);
				color: var(--vscode-editor-foreground, #f3f3f3);
			}
			body.vscode-light {
				background: var(--vscode-editor-background, #ffffff);
				color: var(--vscode-editor-foreground, #111111);
			}
			body.vscode-high-contrast {
				background: #000000;
				color: #ffffff;
			}
			iframe {
				flex: 1;
				width: 100%;
				border: 0;
				background: #ffffff;
			}
			.loading-text {
				padding: 0.5rem 1rem;
				text-align: center;
				font-size: 0.9rem;
				opacity: 0.8;
			}
		</style>
	</head>
	<body>
		<div class="loading-text" id="playground-loading">Loading WordPress Playground…</div>
		<iframe
			src="${playgroundUrl}"
			title="WordPress Playground Preview"
			allow="clipboard-read; clipboard-write; fullscreen; geolocation; microphone; camera; display-capture"
			onload="const el = document.getElementById('playground-loading'); if (el) { el.textContent = 'WordPress Playground is ready.'; el.style.opacity = '0.4'; }"
		></iframe>
	</body>
</html>`;
}
