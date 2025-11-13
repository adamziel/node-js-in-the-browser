/**
 * Kernel Worker Proxy - Bridges extension context to unsandboxed worker
 * Provides a Kernel-like interface that proxies all calls to the worker
 */

import * as vscode from 'vscode';

interface InitializeMessage {
	type: 'initialize';
	runtimeOrigin: string;
	extensionUri: string;
	kernelUri: string;
	nodeModuleUri: string;
}

interface KernelMethodCallMessage {
	type: 'kernel-call';
	id: number;
	method: string;
	args: any[];
}

interface DisposeMessage {
	type: 'dispose';
}

type WorkerOutgoingMessage =
	| InitializeMessage
	| KernelMethodCallMessage
	| DisposeMessage;

interface InitializedMessage {
	type: 'initialized';
}

interface KernelMethodResultMessage {
	type: 'kernel-result';
	id: number;
	result?: any;
	error?: string;
}

interface KernelEventMessage {
	type: 'kernel-event';
	event: string;
	data: any;
}

type WorkerIncomingMessage =
	| InitializedMessage
	| KernelMethodResultMessage
	| KernelEventMessage;

/**
 * Proxy for the Kernel that runs in an unsandboxed worker
 */
export class KernelWorkerProxy {
	private worker: Worker | null = null;
	private nextCallId = 0;
	private pendingCalls = new Map<
		number,
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();
	private initializationPromise: Promise<void> | null = null;

	/**
	 * Initialize the kernel in the worker
	 */
	async initialize(context: vscode.ExtensionContext): Promise<void> {
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = this.doInitialize(context);
		return this.initializationPromise;
	}

	private async doInitialize(
		context: vscode.ExtensionContext
	): Promise<void> {
		// Get runtime origin
		const runtimeOrigin = this.getRuntimeOrigin(context);

		// Build URIs
		const kernelUri =
			globalThis.location.origin + '/kernel/kernel/index.js';
		const nodeModuleUri =
			globalThis.location.origin + '/kernel/kernel-node-js/index.js';

		// Create worker using window.RealWorker (unsandboxed)
		console.log('[KernelWorkerProxy] Creating unsandboxed worker...');

		// Get the worker file path
		// const workerUri = vscode.Uri.joinPath(
		// 	context.extensionUri,
		// 	'dist',
		// 	'kernel-worker.js'
		// );

		// Use RealWorker if available, otherwise fall back to regular Worker
		const WorkerConstructor = (globalThis as any).RealWorker || Worker;
		this.worker = new WorkerConstructor(
			globalThis.location.origin + '/kernel/kernel-worker.js'
		);
		// this.worker = new WorkerConstructor(workerUri.toString(true));

		// Set up message handler
		this.worker.addEventListener(
			'message',
			this.handleWorkerMessage.bind(this)
		);
		this.worker.addEventListener('error', (error) => {
			console.error('[KernelWorkerProxy] Worker error:', error);
		});

		// Send initialization message
		const initMsg: InitializeMessage = {
			type: 'initialize',
			runtimeOrigin,
			extensionUri: context.extensionUri.toString(true),
			kernelUri: kernelUri.toString(true),
			nodeModuleUri: nodeModuleUri.toString(true),
		};

		// Wait for initialization to complete
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Kernel worker initialization timeout'));
			}, 30000); // 30 second timeout

			const handler = (event: MessageEvent<WorkerIncomingMessage>) => {
				if (event.data.type === 'initialized') {
					clearTimeout(timeout);
					this.worker?.removeEventListener('message', handler);
					console.log(
						'[KernelWorkerProxy] Kernel initialized in worker'
					);
					resolve();
				} else if (
					event.data.type === 'kernel-result' &&
					event.data.id === -1
				) {
					// Initialization error
					clearTimeout(timeout);
					this.worker?.removeEventListener('message', handler);
					reject(
						new Error(
							event.data.error || 'Kernel initialization failed'
						)
					);
				}
			};

			this.worker?.addEventListener('message', handler);
			this.worker?.postMessage(initMsg);
		});
	}

	/**
	 * Handle messages from the worker
	 */
	private handleWorkerMessage(
		event: MessageEvent<WorkerIncomingMessage>
	): void {
		const msg = event.data;

		switch (msg.type) {
			case 'kernel-result': {
				const pending = this.pendingCalls.get(msg.id);
				if (pending) {
					this.pendingCalls.delete(msg.id);
					if (msg.error) {
						pending.reject(new Error(msg.error));
					} else {
						pending.resolve(msg.result);
					}
				}
				break;
			}

			case 'kernel-event': {
				// Handle kernel events (could emit via EventEmitter if needed)
				console.log(
					'[KernelWorkerProxy] Kernel event:',
					msg.event,
					msg.data
				);
				break;
			}

			case 'initialized': {
				// Handled during initialization
				break;
			}

			default:
				console.warn(
					'[KernelWorkerProxy] Unknown message type:',
					(msg as any).type
				);
		}
	}

	/**
	 * Call a method on the kernel in the worker
	 */
	private async callKernelMethod(
		method: string,
		...args: any[]
	): Promise<any> {
		if (!this.worker) {
			throw new Error('Kernel worker not initialized');
		}

		const id = this.nextCallId++;

		return new Promise((resolve, reject) => {
			this.pendingCalls.set(id, { resolve, reject });

			const msg: KernelMethodCallMessage = {
				type: 'kernel-call',
				id,
				method,
				args,
			};

			this.worker!.postMessage(msg);

			// Set a timeout for the call
			setTimeout(() => {
				if (this.pendingCalls.has(id)) {
					this.pendingCalls.delete(id);
					reject(new Error(`Kernel method call timeout: ${method}`));
				}
			}, 30000); // 30 second timeout
		});
	}

	/**
	 * Get the underlying kernel (returns this proxy for compatibility)
	 */
	getKernel(): any {
		return this.createKernelProxy();
	}

	/**
	 * Check if initialized
	 */
	isInitialized(): boolean {
		return this.worker !== null && this.initializationPromise !== null;
	}

	/**
	 * Restart the kernel
	 */
	async restart(): Promise<void> {
		this.dispose();
		this.initializationPromise = null;
		// Note: Will need context to re-initialize, so this might need to be called differently
		throw new Error(
			'Restart not implemented - call initialize() with context instead'
		);
	}

	/**
	 * Dispose the worker
	 */
	dispose(): void {
		if (this.worker) {
			const msg: DisposeMessage = { type: 'dispose' };
			this.worker.postMessage(msg);
			this.worker.terminate();
			this.worker = null;
		}
		this.pendingCalls.clear();
		this.initializationPromise = null;
	}

	/**
	 * Create a proxy object that looks like a Kernel instance
	 */
	private createKernelProxy(): any {
		const proxy = new Proxy(
			{},
			{
				get: (target, prop) => {
					// Return a function that proxies to the worker
					return (...args: any[]) => {
						return this.callKernelMethod(String(prop), ...args);
					};
				},
			}
		);
		return proxy;
	}

	/**
	 * Get runtime origin helper
	 */
	private getRuntimeOrigin(context: vscode.ExtensionContext): string {
		if (typeof globalThis.location === 'object') {
			const { origin } = globalThis.location as Location;
			if (origin && origin.startsWith('http')) {
				return origin;
			}
		}
		return `${context.extensionUri.scheme}://${context.extensionUri.authority}`;
	}

	/**
	 * Build runtime URI helper
	 */
	private buildRuntimeUri(
		context: vscode.ExtensionContext,
		resourcePath: string
	): vscode.Uri {
		const origin = this.getRuntimeOrigin(context);
		const normalizedPath = resourcePath.startsWith('/')
			? resourcePath
			: `/${resourcePath}`;
		return vscode.Uri.parse(`${origin}${normalizedPath}`);
	}
}
