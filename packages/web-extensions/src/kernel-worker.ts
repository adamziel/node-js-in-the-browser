/**
 * Kernel Worker - Runs in unsandboxed context with origin isolation support
 * This worker handles WASMFS and other features requiring SharedArrayBuffer/COOP/COEP
 */

import type * as KernelModule from '@adamziel/kernel';

type WasmfsWorkerOverride = {
	source: string;
	baseUrl: string;
};

const wasmfsWorkerSourceKey = '__kernelWasmfsWorkerSource';

const hasWasmfsWorkerOverride = () =>
	Boolean(
		(
			globalThis as typeof globalThis & {
				[wasmfsWorkerSourceKey]?: WasmfsWorkerOverride;
			}
		)[wasmfsWorkerSourceKey]
	);

const setWasmfsWorkerOverride = (override: WasmfsWorkerOverride) => {
	(
		globalThis as typeof globalThis & {
			[wasmfsWorkerSourceKey]?: WasmfsWorkerOverride;
		}
	)[wasmfsWorkerSourceKey] = override;
};

// Message types from extension to worker
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

type WorkerIncomingMessage =
	| InitializeMessage
	| KernelMethodCallMessage
	| DisposeMessage;

// Message types from worker to extension
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

type WorkerOutgoingMessage =
	| InitializedMessage
	| KernelMethodResultMessage
	| KernelEventMessage;

// Worker state
let kernelModule: typeof KernelModule | null = null;
let kernel: any | null = null;
let nodeInstaller: any | null = null;

/**
 * Preload WASMFS worker source to enable origin-isolated features
 */
async function preloadWasmfsWorkerSource(runtimeOrigin: string): Promise<void> {
	if (hasWasmfsWorkerOverride()) {
		return;
	}

	try {
		const workerUrl = `${globalThis.location.origin}/kernel/kernel/wasmfs-fs.js`;
		const response = await (globalThis.realFetch || fetch)(workerUrl);
		if (!response.ok) {
			console.warn(
				'[KernelWorker] Failed to preload WASMFS worker source:',
				response.status,
				response.statusText
			);
			return;
		}
		const source = await response.text();
		setWasmfsWorkerOverride({
			source,
			baseUrl: workerUrl,
		});
		console.log('[KernelWorker] WASMFS worker source preloaded');
	} catch (error) {
		console.warn(
			'[KernelWorker] Failed to preload WASMFS worker source:',
			error
		);
	}
}

/**
 * Load the kernel module dynamically
 */
async function loadKernelModule(
	kernelUrl: string
): Promise<typeof KernelModule> {
	console.log('[KernelWorker] Loading kernel module from:', kernelUrl);
	return import(
		/* @vite-ignore */ /* webpackIgnore: true */ kernelUrl
	) as Promise<typeof KernelModule>;
}

/**
 * Load the Node.js installer module
 */
async function loadNodeJsInstaller(nodeModuleUrl: string): Promise<any> {
	console.log(
		'[KernelWorker] Loading Node.js installer from:',
		nodeModuleUrl
	);
	return import(
		/* @vite-ignore */ /* webpackIgnore: true */ nodeModuleUrl
	) as Promise<any>;
}

/**
 * Initialize the kernel in the worker
 */
async function initialize(msg: InitializeMessage): Promise<void> {
	console.log('[KernelWorker] Initializing kernel...');

	// Preload WASMFS worker source
	await preloadWasmfsWorkerSource(msg.runtimeOrigin);

	// Load kernel module
	kernelModule = await loadKernelModule(msg.kernelUri);

	// Configure worker paths
	const workersBaseUrl = `${msg.runtimeOrigin}/kernel/workers`;
	kernelModule.setWorkerConfig?.({
		processController: `${workersBaseUrl}/process-controller.js`,
		pumpWorker: `${workersBaseUrl}/pump-worker.js`,
		wasmfsWorker: `${workersBaseUrl}/wasmfs-worker.js`,
	});

	// Create kernel instance
	kernel = new kernelModule.Kernel();

	// Install busybox
	await kernelModule.installBusybox(kernel);

	// Set up environment
	kernel.setEnv('HOME', '/home');
	kernel.setEnv('USER', 'user');
	kernel.setEnv('SHELL', '/bin/sh');
	kernel.setEnv('TERM', 'xterm-256color');
	kernel.setEnv('PATH', '/bin:/usr/bin');

	// Create directory structure
	try {
		kernel.mkdirSync('/home', { recursive: true });
		kernel.mkdirSync('/tmp', { recursive: true });
		kernel.mkdirSync('/usr/bin', { recursive: true });
		kernel.mkdirSync('/etc', { recursive: true });
		kernel.mkdirSync('/var', { recursive: true });
	} catch (error) {
		console.warn('[KernelWorker] Error creating directories:', error);
	}

	// Load and install Node.js
	nodeInstaller = await loadNodeJsInstaller(msg.nodeModuleUri);
	await nodeInstaller.installNodeJs(kernel);

	console.log('[KernelWorker] Kernel initialized successfully');

	// Notify extension that initialization is complete
	const response: InitializedMessage = { type: 'initialized' };
	postMessage(response);
}

/**
 * Handle kernel method calls from the extension
 */
async function handleKernelMethodCall(
	msg: KernelMethodCallMessage
): Promise<void> {
	if (!kernel) {
		const errorResponse: KernelMethodResultMessage = {
			type: 'kernel-result',
			id: msg.id,
			error: 'Kernel not initialized',
		};
		postMessage(errorResponse);
		return;
	}

	try {
		const method = (kernel as any)[msg.method];
		if (typeof method !== 'function') {
			throw new Error(`Method ${msg.method} not found on kernel`);
		}

		const result = await method.apply(kernel, msg.args);

		const response: KernelMethodResultMessage = {
			type: 'kernel-result',
			id: msg.id,
			result,
		};
		postMessage(response);
	} catch (error) {
		const errorResponse: KernelMethodResultMessage = {
			type: 'kernel-result',
			id: msg.id,
			error: error instanceof Error ? error.message : String(error),
		};
		postMessage(errorResponse);
	}
}

/**
 * Dispose the kernel
 */
function dispose(): void {
	console.log('[KernelWorker] Disposing kernel...');
	if (kernel && typeof kernel.dispose === 'function') {
		kernel.dispose();
	}
	kernel = null;
	kernelModule = null;
	nodeInstaller = null;
}

// Message handler
self.addEventListener(
	'message',
	async (event: MessageEvent<WorkerIncomingMessage>) => {
		const msg = event.data;

		switch (msg.type) {
			case 'initialize':
				try {
					await initialize(msg);
				} catch (error) {
					console.error(
						'[KernelWorker] Initialization error:',
						error
					);
					// Send error back to extension
					const errorResponse: KernelMethodResultMessage = {
						type: 'kernel-result',
						id: -1,
						error:
							error instanceof Error
								? error.message
								: String(error),
					};
					postMessage(errorResponse);
				}
				break;

			case 'kernel-call':
				await handleKernelMethodCall(msg);
				break;

			case 'dispose':
				dispose();
				break;

			default:
				console.warn(
					'[KernelWorker] Unknown message type:',
					(msg as any).type
				);
		}
	}
);

console.log('[KernelWorker] Worker started and ready');
