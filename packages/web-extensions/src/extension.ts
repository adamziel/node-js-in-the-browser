import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';
import { KernelFileSystemProvider } from './kernelFileSystemProvider';
import { KernelTerminalProvider } from './kernelTerminalProvider';
import type * as KernelModule from '@adamziel/kernel';
import { onDidLoadKernel } from './on-did-kernel-load';

let kernelManager: KernelManager;
let fsProvider: KernelFileSystemProvider;
let terminalProvider: KernelTerminalProvider;

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
