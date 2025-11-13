import * as vscode from 'vscode';
import { KernelWorkerProxy } from './kernelWorkerProxy';

/**
 * Manages the kernel instance lifecycle
 * Now uses KernelWorkerProxy to run kernel in unsandboxed worker for origin isolation support
 */
export class KernelManager {
	private kernel: any | null = null;
	private initializationPromise: Promise<void> | null = null;
	private workerProxy: KernelWorkerProxy | null = null;
	private context: vscode.ExtensionContext | null = null;

	async initialize(context?: vscode.ExtensionContext): Promise<void> {
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		if (context) {
			this.context = context;
		}

		if (!this.context) {
			throw new Error('ExtensionContext required for first initialization');
		}

		this.initializationPromise = this.doInitialize();
		return this.initializationPromise;
	}

	private async doInitialize(): Promise<void> {
		console.log('[KernelManager] Initializing kernel in worker...');

		// Create worker proxy
		this.workerProxy = new KernelWorkerProxy();
		await this.workerProxy.initialize(this.context!);

		// Get the proxied kernel instance
		this.kernel = this.workerProxy.getKernel();

		console.log('[KernelManager] Kernel initialization complete');
	}

	async restart(): Promise<void> {
		console.log('[KernelManager] Restarting kernel...');
		this.dispose();
		this.initializationPromise = null;
		await this.initialize();
	}

	getKernel(): any {
		if (!this.kernel) {
			throw new Error('Kernel not initialized. Call initialize() first.');
		}
		return this.kernel;
	}

	isInitialized(): boolean {
		return this.workerProxy?.isInitialized() ?? false;
	}

	dispose(): void {
		if (this.workerProxy) {
			console.log('[KernelManager] Disposing kernel worker...');
			this.workerProxy.dispose();
			this.workerProxy = null;
		}
		this.kernel = null;
		this.initializationPromise = null;
	}
}
