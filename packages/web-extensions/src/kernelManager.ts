import { Kernel } from '@adamziel/kernel/runtime/core/kernel';
import { installBusybox } from '@adamziel/kernel/runtime/busybox/index';

/**
 * Manages the kernel instance lifecycle
 */
export class KernelManager {
	private kernel: Kernel | null = null;
	private initializationPromise: Promise<void> | null = null;

	async initialize(): Promise<void> {
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = this.doInitialize();
		return this.initializationPromise;
	}

	private async doInitialize(): Promise<void> {
		console.log('[KernelManager] Initializing kernel...');

		// Create kernel instance
		this.kernel = new Kernel();

		// Set up basic environment
		this.kernel.setEnv('HOME', '/home');
		this.kernel.setEnv('USER', 'user');
		this.kernel.setEnv('SHELL', '/bin/sh');
		this.kernel.setEnv('TERM', 'xterm-256color');
		this.kernel.setEnv('PATH', '/bin:/usr/bin');

		// Create basic directory structure
		this.kernel.mkdirSync('/home', { mode: 0o755, recursive: true });
		this.kernel.mkdirSync('/tmp', { mode: 0o777, recursive: true });
		this.kernel.mkdirSync('/usr/bin', { mode: 0o755, recursive: true });
		this.kernel.mkdirSync('/etc', { mode: 0o755, recursive: true });
		this.kernel.mkdirSync('/var', { mode: 0o755, recursive: true });

		// Install busybox commands
		console.log('[KernelManager] Installing busybox...');
		installBusybox(this.kernel);

		// TODO: Install custom programs (node, php, etc.) if available
		// installCustomPrograms(this.kernel);

		console.log('[KernelManager] Kernel initialization complete');
	}

	async restart(): Promise<void> {
		console.log('[KernelManager] Restarting kernel...');
		this.dispose();
		this.initializationPromise = null;
		await this.initialize();
	}

	getKernel(): Kernel {
		if (!this.kernel) {
			throw new Error('Kernel not initialized. Call initialize() first.');
		}
		return this.kernel;
	}

	isInitialized(): boolean {
		return this.kernel !== null;
	}

	dispose(): void {
		if (this.kernel) {
			console.log('[KernelManager] Disposing kernel...');
			this.kernel.dispose();
			this.kernel = null;
		}
		this.initializationPromise = null;
	}
}
