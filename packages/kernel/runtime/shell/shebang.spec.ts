import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../core/kernel.ts';
import { installBusybox } from '../busybox/index.ts';

const textDecoder = new TextDecoder();

const chunkToString = (chunk: string | Uint8Array) =>
	typeof chunk === 'string' ? chunk : textDecoder.decode(chunk);

describe('Shebang support', () => {
	let kernel: Kernel;

	beforeEach(async () => {
		kernel = new Kernel();
		// Use wasmfs to avoid SharedArrayBuffer requirement in tests
		await kernel.setFsConnectorPreference('wasmfs');
		installBusybox(kernel);
		kernel.mkdirSync('/bin', { recursive: true });
		kernel.mkdirSync('/usr/bin', { recursive: true });
		kernel.mkdirSync('/home', { recursive: true });
		kernel.setEnv('PATH', '/bin:/usr/bin');
		kernel.setEnv('HOME', '/home');
	});

	it('executes script with #!/bin/sh shebang', async () => {
		// Create a simple shell script with shebang
		kernel.writeFileSync(
			'/home/test.sh',
			`#!/bin/sh
echo "Hello from sh"
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['sh', '/home/test.sh'],
			env: kernel.getAllEnv(),
			cwd: '/',
			name: 'shebang-sh-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		let stderr = '';
		subprocess.stderr?.on('data', (chunk) => {
			stderr += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout.trim()).toBe('Hello from sh');
	});

	it('executes script with #!/usr/bin/env sh shebang', async () => {
		// Create a script with env-style shebang
		kernel.writeFileSync(
			'/home/env-test.sh',
			`#!/usr/bin/env sh
echo "Hello from env sh"
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['sh', '/home/env-test.sh'],
			env: kernel.getAllEnv(),
			cwd: '/',
			name: 'shebang-env-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		let stderr = '';
		subprocess.stderr?.on('data', (chunk) => {
			stderr += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout.trim()).toBe('Hello from env sh');
	});

	it('passes script path and args to the interpreter when executing directly', async () => {
		kernel.writeFileSync(
			'/bin/mock-interpreter',
			`
				export default async function main(processController) {
					const payload = JSON.stringify({
						argv: processController.argv(),
					});
					processController.stdout.write(payload + '\\n');
					return 0;
				}
			`,
			{ mode: 0o755 }
		);

		kernel.writeFileSync(
			'/home/shebang-test.js',
			`#!/bin/mock-interpreter
console.log('should not run');
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['/home/shebang-test.js', 'alpha', 'beta'],
			env: kernel.getAllEnv(),
			cwd: '/',
			name: 'shebang-argv-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout.trim()) as { argv: string[] };
		expect(parsed.argv[0]).toMatch(/mock-interpreter$/);
		expect(parsed.argv[1]).toMatch(/shebang-test\.js$/);
		expect(parsed.argv.slice(2)).toEqual(['alpha', 'beta']);
	});

	it('supports /usr/bin/env shebangs when executing directly', async () => {
		kernel.writeFileSync(
			'/bin/mock-env-interpreter',
			`
				export default async function main(processController) {
					const payload = JSON.stringify({
						env: {
							argv: processController.argv(),
						},
					});
					processController.stdout.write(payload + '\\n');
					return 0;
				}
			`,
			{ mode: 0o755 }
		);

		kernel.writeFileSync(
			'/home/env-shebang.js',
			`#!/usr/bin/env mock-env-interpreter
console.log('noop');
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['/home/env-shebang.js', 'delta'],
			env: kernel.getAllEnv(),
			cwd: '/',
			name: 'shebang-env-direct-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout.trim()) as {
			env: { argv: string[] };
		};
		expect(parsed.env.argv[0]).toMatch(/mock-env-interpreter$/);
		expect(parsed.env.argv[1]).toMatch(/env-shebang\.js$/);
		expect(parsed.env.argv.slice(2)).toEqual(['delta']);
	});

	it('executes script directly with shebang via relative path', async () => {
		// Create a script with shebang
		kernel.writeFileSync(
			'/home/direct.sh',
			`#!/bin/sh
echo "Executed directly"
`,
			{ mode: 0o755 }
		);

		// Execute directly using relative path
		const subprocess = kernel.spawn({
			argv: ['sh', '-c', './direct.sh'],
			env: kernel.getAllEnv(),
			cwd: '/home',
			name: 'shebang-direct-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		let stderr = '';
		subprocess.stderr?.on('data', (chunk) => {
			stderr += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout.trim()).toBe('Executed directly');
	});

	it('handles missing interpreter gracefully', async () => {
		// Create a script with non-existent interpreter
		kernel.writeFileSync(
			'/home/bad-shebang.sh',
			`#!/bin/nonexistent
echo "This should not run"
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['sh', '-c', './bad-shebang.sh'],
			env: kernel.getAllEnv(),
			cwd: '/home',
			name: 'shebang-missing-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		let stderr = '';
		subprocess.stderr?.on('data', (chunk) => {
			stderr += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		// Should exit with error code (127 for command not found)
		expect(exitCode).not.toBe(0);
	});

	it('executes scripts without shebang normally', async () => {
		// Create a script without shebang
		kernel.writeFileSync(
			'/home/no-shebang.sh',
			`echo "No shebang here"
`,
			{ mode: 0o755 }
		);

		const subprocess = kernel.spawn({
			argv: ['sh', '/home/no-shebang.sh'],
			env: kernel.getAllEnv(),
			cwd: '/',
			name: 'no-shebang-test',
			stdio: {
				stdin: 'ignore',
				stdout: 'pipe',
				stderr: 'pipe',
			},
		});

		expect(typeof subprocess).not.toBe('number');
		if (typeof subprocess === 'number') {
			throw new Error('spawn returned error code');
		}

		let stdout = '';
		subprocess.stdout?.on('data', (chunk) => {
			stdout += chunkToString(chunk);
		});

		let stderr = '';
		subprocess.stderr?.on('data', (chunk) => {
			stderr += chunkToString(chunk);
		});

		const exitCode = await new Promise<number>((resolve) => {
			subprocess.onExit((code) => resolve(code ?? 0));
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout.trim()).toBe('No shebang here');
	});
});
