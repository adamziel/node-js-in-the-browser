import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';
import { KernelFileSystemProvider } from './kernelFileSystemProvider';
import { KernelTerminalProvider } from './kernelTerminalProvider';

let kernelManager: KernelManager;
let fsProvider: KernelFileSystemProvider;
let terminalProvider: KernelTerminalProvider;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Kernel VS Code extension is activating...');

	try {
		kernelManager = new KernelManager();
		await kernelManager.initialize();

		fsProvider = new KernelFileSystemProvider(kernelManager);
		context.subscriptions.push(
			vscode.workspace.registerFileSystemProvider('kernel', fsProvider, {
				isCaseSensitive: true,
				isReadonly: false,
			})
		);

		terminalProvider = new KernelTerminalProvider(kernelManager);
		context.subscriptions.push(
			vscode.window.registerTerminalProfileProvider(
				'kernel.terminal',
				terminalProvider
			)
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('kernel.openTerminal', async () => {
				const terminal = await terminalProvider.createTerminal();
				terminal.show();
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('kernel.restart', async () => {
				await kernelManager.restart();
				vscode.window.showInformationMessage('Kernel restarted successfully');
			})
		);

		vscode.window.showInformationMessage('JavaScript Kernel extension activated!');
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

	terminalProvider?.dispose();
	kernelManager?.dispose();
}
