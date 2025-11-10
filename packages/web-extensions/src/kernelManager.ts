import * as vscode from 'vscode';

export type RemoteFileType = 'file' | 'directory' | 'symlink' | 'unknown';

export interface RemoteFileStat {
	readonly type: RemoteFileType;
	readonly size: number;
	readonly ctime: number;
	readonly mtime: number;
	readonly mode: number;
}

export interface RemoteDirectoryEntry {
	readonly name: string;
	readonly type: RemoteFileType;
}

export interface RemoteSpawnOptions {
	argv: string[];
	env: Record<string, string>;
	cwd: string;
	name: string;
	stdio?: {
		stdin?: 'pipe' | 'inherit' | 'ignore';
		stdout?: 'pipe' | 'inherit' | 'ignore';
		stderr?: 'pipe' | 'inherit' | 'ignore';
	};
}

interface KernelProcessDelegate {
	handleProcessEvent(event: ProcessEventMessage): void;
}

interface ProcessEventMessage {
	pid: number;
	event: 'stdout' | 'stderr' | 'exit';
	data?: string;
	code?: number | null;
}

interface PendingRequest {
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	timer: ReturnType<typeof setTimeout>;
}

const delay = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export class KernelManager {
	private readonly kernel = new RemoteKernel();

	async initialize(): Promise<void> {
		await this.kernel.initialize();
	}

	getKernel(): RemoteKernel {
		return this.kernel;
	}

	async restart(): Promise<void> {
		await this.kernel.restart();
	}

	dispose(): void {
		this.kernel.dispose();
	}
}

export class RemoteKernel {
	private readonly bridge = new KernelBridge();
	private readyPromise: Promise<void> | null = null;

	private async ensureReady(): Promise<void> {
		if (!this.readyPromise) {
			this.readyPromise = this.bridge.ready();
		}
		return this.readyPromise;
	}

	async initialize(): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('initialize');
	}

	async restart(): Promise<void> {
		await this.bridge.request('restart');
	}

	async stat(path: string): Promise<RemoteFileStat> {
		await this.ensureReady();
		return this.bridge.request('stat', { path }) as Promise<RemoteFileStat>;
	}

	async readDirectory(path: string): Promise<RemoteDirectoryEntry[]> {
		await this.ensureReady();
		return this.bridge.request('readDirectory', { path }) as Promise<RemoteDirectoryEntry[]>;
	}

	async createDirectory(path: string, options: { recursive: boolean }): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('createDirectory', {
			path,
			recursive: options.recursive,
		});
	}

	async readFile(path: string): Promise<Uint8Array> {
		await this.ensureReady();
		const result = (await this.bridge.request('readFile', { path })) as Uint8Array;
		return new Uint8Array(result);
	}

	async writeFile(
		path: string,
		content: Uint8Array,
		options: { mode?: number }
	): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('writeFile', {
			path,
			content,
			mode: options.mode ?? 0o644,
		});
	}

	async delete(path: string, options: { recursive: boolean }): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('delete', {
			path,
			recursive: options.recursive,
		});
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('rename', { from: oldPath, to: newPath });
	}

	async copy(source: string, destination: string): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('copy', { from: source, to: destination });
	}

	async exists(path: string): Promise<boolean> {
		await this.ensureReady();
		return this.bridge.request('exists', { path }) as Promise<boolean>;
	}

	async setEnv(key: string, value: string): Promise<void> {
		await this.ensureReady();
		await this.bridge.request('setEnv', { key, value });
	}

	async getEnv(key: string): Promise<string | null> {
		await this.ensureReady();
		return this.bridge.request('getEnv', { key }) as Promise<string | null>;
	}

	async spawn(
		options: RemoteSpawnOptions
	): Promise<number | RemoteKernelProcess> {
		await this.ensureReady();
		const result = await this.bridge.request('spawn', { options });
		if (result && typeof result === 'object' && result.kind === 'process') {
			return new RemoteKernelProcess(this.bridge, result.pid);
		}
		if (result && typeof result === 'object' && result.kind === 'exit') {
			return result.code ?? 1;
		}
		return 1;
	}

	dispose(): void {
		this.bridge.dispose();
	}
}

export class RemoteKernelProcess implements KernelProcessDelegate {
	private readonly stdoutEmitter = new vscode.EventEmitter<string>();
	private readonly stderrEmitter = new vscode.EventEmitter<string>();
	private readonly exitEmitter = new vscode.EventEmitter<number | null>();

	constructor(private readonly bridge: KernelBridge, private readonly pid: number) {
		this.bridge.registerProcessDelegate(pid, this);
	}

	handleProcessEvent(event: ProcessEventMessage): void {
		switch (event.event) {
			case 'stdout': {
				if (typeof event.data === 'string') {
					this.stdoutEmitter.fire(event.data);
				}
				break;
			}
			case 'stderr': {
				if (typeof event.data === 'string') {
					this.stderrEmitter.fire(event.data);
				}
				break;
			}
			case 'exit': {
				this.exitEmitter.fire(event.code ?? null);
				this.dispose();
				break;
			}
			default:
				break;
		}
	}

	onStdout(listener: (data: string) => void): vscode.Disposable {
		return this.stdoutEmitter.event(listener);
	}

	onStderr(listener: (data: string) => void): vscode.Disposable {
		return this.stderrEmitter.event(listener);
	}

	onExit(listener: (code: number | null) => void): vscode.Disposable {
		return this.exitEmitter.event(listener);
	}

	async write(data: string): Promise<void> {
		this.bridge.sendProcessMessage('stdin', { pid: this.pid, data });
	}

	async kill(): Promise<void> {
		this.bridge.sendProcessMessage('kill', { pid: this.pid });
	}

	dispose(): void {
		this.bridge.unregisterProcessDelegate(this.pid);
		this.stdoutEmitter.dispose();
		this.stderrEmitter.dispose();
		this.exitEmitter.dispose();
	}
}

class KernelBridge {
	private readonly channel = new BroadcastChannel('kernel-host');
	private readonly clientId = `kernel-client-${Math.random().toString(36).slice(2)}`;
	private requestCounter = 1;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly processDelegates = new Map<number, KernelProcessDelegate>();
	private disposed = false;

	constructor() {
		this.channel.addEventListener('message', this.handleMessage);
	}

	async ready(): Promise<void> {
		const maxAttempts = 20;
		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			try {
				await this.sendRequest('ping', {}, 2000);
				return;
			} catch (error) {
				await delay(250 * (attempt + 1));
			}
		}
		throw new Error('Kernel host is unavailable');
	}

	request(action: string, payload: Record<string, unknown> = {}, timeoutMs = 15000) {
		return this.sendRequest(action, payload, timeoutMs);
	}

	registerProcessDelegate(pid: number, delegate: KernelProcessDelegate) {
		this.processDelegates.set(pid, delegate);
	}

	unregisterProcessDelegate(pid: number) {
		this.processDelegates.delete(pid);
	}

	sendProcessMessage(action: 'stdin' | 'kill', payload: { pid: number; data?: string }) {
		if (this.disposed) {
			return;
		}
		this.channel.postMessage({
			type: 'process-control',
			clientId: this.clientId,
			action,
			pid: payload.pid,
			data: payload.data,
		});
	}

	dispose() {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.channel.removeEventListener('message', this.handleMessage);
		this.channel.close();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error('Kernel bridge disposed'));
		}
		this.pending.clear();
		this.processDelegates.clear();
	}

	private sendRequest(
		action: string,
		payload: Record<string, unknown>,
		timeoutMs: number
	): Promise<unknown> {
		if (this.disposed) {
			return Promise.reject(new Error('Kernel bridge disposed'));
		}
		const requestId = `${this.clientId}:${this.requestCounter++}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(new Error(`Kernel request "${action}" timed out`));
			}, timeoutMs);

			this.pending.set(requestId, { resolve, reject, timer });
			this.channel.postMessage({
				type: 'request',
				clientId: this.clientId,
				requestId,
				action,
				payload,
			});
		});
	}

	private handleMessage = (event: MessageEvent) => {
		const data = event.data;
		if (!data) {
			return;
		}

		if (data.type === 'response' && data.clientId === this.clientId) {
			const pending = this.pending.get(data.requestId);
			if (!pending) {
				return;
			}
			this.pending.delete(data.requestId);
			clearTimeout(pending.timer);
			if (data.ok) {
				pending.resolve(data.result);
			} else {
				pending.reject(new Error(data.error?.message ?? 'Kernel error'));
			}
			return;
		}

		if (data.type === 'process-event' && data.clientId === this.clientId) {
			const delegate = this.processDelegates.get(data.pid);
			if (delegate) {
				delegate.handleProcessEvent(data);
			}
		}
	};
}
