import * as vscode from 'vscode';
import { KernelManager, RemoteKernel, RemoteKernelProcess } from './kernelManager';

export class KernelTerminalProvider implements vscode.TerminalProfileProvider {
	private terminals: Map<number, KernelTerminal> = new Map();
	private terminalCounter = 1;

	constructor(private kernelManager: KernelManager) {}

	async provideTerminalProfile(
		_token: vscode.CancellationToken
	): Promise<vscode.TerminalProfile> {
		return new vscode.TerminalProfile({
			name: 'Kernel Shell',
			pty: await this.createTerminalPty(),
		});
	}

	async createTerminal(): Promise<vscode.Terminal> {
		const pty = await this.createTerminalPty();
		const terminal = vscode.window.createTerminal({
			name: `Kernel Shell ${this.terminalCounter++}`,
			pty,
		});
		return terminal;
	}

	private async createTerminalPty(): Promise<KernelTerminalPty> {
		const kernel = this.kernelManager.getKernel();
		const id = this.terminalCounter;
		const terminal = new KernelTerminal(kernel, id);
		this.terminals.set(id, terminal);
		terminal.onDidClose(() => this.terminals.delete(id));
		return terminal;
	}

	dispose(): void {
		for (const terminal of this.terminals.values()) {
			terminal.dispose();
		}
		this.terminals.clear();
	}
}

class KernelTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	onDidWrite = this.writeEmitter.event;
	onDidClose = this.closeEmitter.event;

	private process: RemoteKernelProcess | null = null;
	private isOpen = false;

	constructor(private kernel: RemoteKernel, private id: number) {}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		this.isOpen = true;
		void this.startShell();
	}

	private async startShell(): Promise<void> {
		try {
			const shellPath = '/bin/tty-shell';
			const exists = await this.kernel.exists(shellPath);
			if (!exists) {
				throw new Error('tty-shell program is missing from /bin');
			}

			const result = await this.kernel.spawn({
				argv: [shellPath, '$ '],
				env: {
					PATH: (await this.kernel.getEnv('PATH')) || '/bin',
					HOME: (await this.kernel.getEnv('HOME')) || '/home',
					USER: (await this.kernel.getEnv('USER')) || 'user',
					TERM: 'xterm-256color',
					SHELL: shellPath,
				},
				cwd: (await this.kernel.getEnv('HOME')) || '/',
				name: `terminal-${this.id}`,
				stdio: {
					stdin: 'pipe',
					stdout: 'pipe',
					stderr: 'pipe',
				},
			});

			if (typeof result === 'number') {
				this.writeEmitter.fire(
					`Failed to start shell: exit code ${result}\r\n`
				);
				this.closeEmitter.fire(result);
				return;
			}

			this.process = result;
			this.process.onStdout((chunk) => this.writeEmitter.fire(chunk));
			this.process.onStderr((chunk) => this.writeEmitter.fire(chunk));
			this.process.onExit((code) => this.closeEmitter.fire(code ?? undefined));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.writeEmitter.fire(`Failed to start shell: ${message}\r\n`);
			this.closeEmitter.fire(1);
		}
	}

	close(): void {
		this.isOpen = false;
		void this.process?.kill();
		this.process = null;
	}

	handleInput(data: string): void {
		if (!this.isOpen || !this.process) {
			return;
		}
		void this.process.write(data);
	}

	setDimensions(): void {
		// TODO: resize support
	}

	dispose(): void {
		this.close();
		this.writeEmitter.dispose();
		this.closeEmitter.dispose();
	}
}

type KernelTerminalPty = KernelTerminal;
