import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';
import type { KernelSubprocess } from '@adamziel/kernel/runtime/core/kernel';

/**
 * VS Code Terminal integration for the kernel shell
 */
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

	private async createTerminalPty(): Promise<KernelTerminal> {
		const kernel = this.kernelManager.getKernel();
		const id = this.terminalCounter;

		const terminal = new KernelTerminal(kernel, id);
		this.terminals.set(id, terminal);

		terminal.onDidClose(() => {
			this.terminals.delete(id);
		});

		return terminal;
	}

	dispose(): void {
		for (const terminal of this.terminals.values()) {
			terminal.dispose();
		}
		this.terminals.clear();
	}
}

/**
 * Pseudoterminal implementation that runs the kernel tty-shell
 */
class KernelTerminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	onDidWrite = this.writeEmitter.event;
	onDidClose = this.closeEmitter.event;

	private process: KernelSubprocess | null = null;
	private isOpen = false;
	private dimensions?: vscode.TerminalDimensions;

	constructor(private kernel: any, private id: number) {}

	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		this.isOpen = true;
		this.dimensions = initialDimensions;
		this.startShell();
	}

	private async startShell(): Promise<void> {
		try {
			const shellPath = '/bin/tty-shell';
			if (!this.kernel.existsSync(shellPath)) {
				throw new Error('tty-shell program is missing from /bin');
			}

			// Spawn the shell process
			const result = this.kernel.spawn({
				argv: [shellPath, '$ '],
				env: {
					PATH: this.kernel.getEnv('PATH') || '/bin',
					HOME: this.kernel.getEnv('HOME') || '/home',
					USER: this.kernel.getEnv('USER') || 'user',
					TERM: 'xterm-256color',
					SHELL: shellPath,
				},
				cwd: this.kernel.getEnv('HOME') || '/',
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
			(console.log, function (...args: any[]) {})(
				'[Terminal] process',
				this.process
			);

			// Handle stdout
			if (this.process.stdout) {
				(console.log, function (...args: any[]) {})(
					'Registering stdout listener'
				);
				this.process.stdout.on('data', (chunk: string | Uint8Array) => {
					const text =
						typeof chunk === 'string'
							? chunk
							: new TextDecoder().decode(chunk);
					// (console.log, function (...args: any[]) {})(
					// 	'[Terminal] stdout data',
					// 	text
					// );
					this.writeEmitter.fire(text);
				});

				this.process.stdout.on('end', () => {
					(console.log, function (...args: any[]) {})(
						'[Terminal] stdout ended'
					);
				});
			}

			// Handle stderr
			if (this.process.stderr) {
				this.process.stderr.on('data', (chunk: string | Uint8Array) => {
					const text =
						typeof chunk === 'string'
							? chunk
							: new TextDecoder().decode(chunk);
					this.writeEmitter.fire(text);
				});
			}

			// Handle exit
			this.process.onExit((code) => {
				(console.log, function (...args: any[]) {})(
					`[Terminal] Process exited with code ${code}`
				);
				this.closeEmitter.fire(code);
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.writeEmitter.fire(`Failed to start shell: ${message}\r\n`);
			this.closeEmitter.fire(1);
		}
	}

	close(): void {
		this.isOpen = false;
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
	}

	handleInput(data: string): void {
		(console.log, function (...args: any[]) {})(
			'[Terminal] handleInput',
			data,
			{
				isOpen: this.isOpen,
				process: this.process,
				processStdin: this.process?.stdin,
			}
		);
		if (!this.isOpen || !this.process || !this.process.stdin) {
			return;
		}

		try {
			this.process.stdin.write(data);
		} catch (error) {
			console.error('[Terminal] Error writing to stdin:', error);
		}
	}

	setDimensions(dimensions: vscode.TerminalDimensions): void {
		this.dimensions = dimensions;
		// TODO: Send resize signal to shell if needed
	}

	dispose(): void {
		this.close();
		this.writeEmitter.dispose();
		this.closeEmitter.dispose();
	}
}
