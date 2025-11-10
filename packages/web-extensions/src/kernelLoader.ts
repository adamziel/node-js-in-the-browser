import * as vscode from 'vscode';

// import type * as KernelModule from '@adamziel/kernel';

let kernelModulePromise: Promise<KernelModule> | null = null;

export function loadKernelModule(
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
