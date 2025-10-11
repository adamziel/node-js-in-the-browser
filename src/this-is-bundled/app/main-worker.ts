'use strict'
import { initFiles } from './init-demo-fs.js'
import { spawnNodeProcess } from './spawn-node-process.ts'
import type { NodeProcessExitInfo } from './spawn-node-process.ts'
import { RemoteInMemoryFileSystem } from './in-memory-fs.client.js'
import { exposeAPI } from './api.ts'
import * as Comlink from './comlink-sync.ts'

// Create and attach the filesystem worker
const fsWorker = await new Promise((resolve) => {
	const fsWorkerUrl = new URL(
		'/dist/app/in-memory-fs.worker.js',
		import.meta.url
	)
	const worker = new Worker(fsWorkerUrl, {
		type: 'module',
		name: 'InMemoryFileSystem',
	})
	worker.onerror = (...args) => {
		console.error('Filesystem worker error:', ...args)
	}
	worker.onmessage = (event) => {
		if (event.data === 'ready') {
			console.log('Filesystem worker initialized')
			resolve(worker)
		}
	}
})

function createFilesystemPort() {
	const channel = new MessageChannel()
	fsWorker.postMessage({ cmd: 'attach', port: channel.port1 }, [
		channel.port1,
	])
	return channel.port2
}

// Attach the filesystem worker to the main worker
const fsPort = createFilesystemPort()
globalThis.globalFs = await RemoteInMemoryFileSystem.connect(fsPort)

class ShellCommandExecutor {
	constructor(fs) {
		this.fs = fs
	}

	resolvePath(cwd, input) {
		if (!input || input === '.') {
			return cwd
		}
		const parts = input.split('/')
		const base = input.startsWith('/') ? [] : cwd.split('/').filter(Boolean)
		for (const part of parts) {
			if (!part || part === '.') {
				continue
			}
			if (part === '..') {
				base.pop()
				continue
			}
			base.push(part)
		}
		return `/${base.join('/')}` || '/'
	}

	formatFsError(prefix, target, error) {
		const code = error && error.code ? error.code : 'ERROR'
		if (code === 'ENOENT') {
			return `${prefix}: cannot access '${target}': No such file or directory`
		}
		if (code === 'ENOTDIR') {
			return `${prefix}: cannot access '${target}': Not a directory`
		}
		return `${prefix}: ${error.message}`
	}

	changeDirectory(cwd, target, { throwOnError = false } = {}) {
		const resolved = this.resolvePath(cwd, target ?? '/')
		try {
			const stats = this.fs.statSync(resolved)
			if (!stats.isDirectory()) {
				const error = new Error(
					`ENOTDIR: not a directory, chdir '${resolved}'`
				)
				error.code = 'ENOTDIR'
				throw error
			}
			return { ok: true, cwd: resolved }
		} catch (error) {
			const code = error && error.code ? error.code : 'ERROR'
			let message
			if (code === 'ENOENT') {
				message = `cd: ${target}: No such file or directory`
			} else if (code === 'ENOTDIR') {
				message = `cd: ${target}: Not a directory`
			} else {
				message = `cd: ${error.message}`
			}
			if (throwOnError) {
				const wrapped = new Error(message)
				wrapped.code = code
				wrapped.originalError = error
				wrapped.cwd = cwd
				throw wrapped
			}
			return { ok: false, cwd, message }
		}
	}

	handleList(cwd, args) {
		const targets = args.length ? args : ['.']
		const out = []
		const err = []
		for (const target of targets) {
			const resolved = this.resolvePath(cwd, target)
			try {
				const stats = this.fs.statSync(resolved)
				if (stats.isDirectory()) {
					const entries = this.fs
						.readdirSync(resolved)
						.sort((a, b) => a.localeCompare(b))
					for (const entry of entries) {
						out.push(`${entry}\n`)
					}
				} else {
					const name = resolved.split('/').pop() ?? ''
					out.push(`${name}\n`)
				}
			} catch (error) {
				err.push(
					`${this.formatFsError('ls', target, error)}\n`
				)
			}
		}
		return { stdout: out.join(''), stderr: err.join('') }
	}

	handleMkdir(cwd, args) {
		if (!args.length) {
			return { stdout: '', stderr: 'mkdir: missing operand\n' }
		}
		let recursive = false
		const targets = []
		for (const arg of args) {
			if (arg === '-p') {
				recursive = true
				continue
			}
			if (arg.startsWith('-')) {
				return {
					stdout: '',
					stderr: `mkdir: invalid option '${arg}'\n`,
				}
			}
			targets.push(arg)
		}
		if (!targets.length) {
			return { stdout: '', stderr: 'mkdir: missing operand\n' }
		}
		const err = []
		for (const target of targets) {
			const resolved = this.resolvePath(cwd, target)
			try {
				if (recursive) {
					this.fs.mkdirSync(resolved, { recursive: true })
				} else {
					this.fs.mkdirSync(resolved)
				}
			} catch (error) {
				const code = error && error.code ? error.code : 'ERROR'
				if (code === 'EEXIST' && recursive) {
					continue
				}
				if (code === 'EEXIST') {
					err.push(`mkdir: ${target}: File exists\n`)
				} else if (code === 'ENOENT') {
					err.push(
						`mkdir: ${target}: No such file or directory\n`
					)
				} else if (code === 'ENOTDIR') {
					err.push(`mkdir: ${target}: Not a directory\n`)
				} else {
					err.push(`mkdir: ${error.message}\n`)
				}
			}
		}
		return { stdout: '', stderr: err.join('') }
	}

	handleCat(cwd, args) {
		if (!args.length) {
			return { stdout: '', stderr: 'cat: missing operand\n' }
		}
		const out = []
		const err = []
		for (const arg of args) {
			const resolved = this.resolvePath(cwd, arg)
			try {
				const content = this.fs.readFileSync(resolved, 'utf-8')
				out.push(content)
			} catch (error) {
				err.push(
					`${this.formatFsError('cat', arg, error)}\n`
				)
			}
		}
		return { stdout: out.join(''), stderr: err.join('') }
	}

	handleEcho(args) {
		return { stdout: args.join(' '), stderr: '' }
	}

	getHelpText() {
		return [
			'Available commands:\n',
			'  help    Show this help message\n',
			'  ls      List files in the current directory\n',
			'  pwd     Print the current working directory\n',
			'  cd      Change the current working directory\n',
			'  mkdir   Create directories (use -p to create parents)\n',
			'  extract-targz <archive> [dest]  Extract a .tar.gz archive\n',
			'  node    Run a Node.js script (basic flags supported)\n',
			'  npm     Run the bundled npm executable\n',
		].join('')
	}

	execute(cwd, command, args) {
		const result = {
			handled: true,
			cwd,
			stdout: '',
			stderr: '',
		}
		switch (command) {
			case 'help':
				result.stdout = this.getHelpText()
				return result
			case 'pwd':
				result.stdout = `${cwd}\n`
				return result
			case 'cd': {
				const change = this.changeDirectory(cwd, args[0] ?? '/')
					if (change.ok) {
						result.cwd = change.cwd
					} else {
						result.stderr = `${change.message}\n`
					}
				return result
			}
			case 'ls': {
				const { stdout, stderr } = this.handleList(cwd, args)
				result.stdout = stdout
				result.stderr = stderr
				return result
			}
			case 'echo': {
				const { stdout, stderr } = this.handleEcho(args)
				result.stdout = stdout
				result.stderr = stderr
				return result
			}
			case 'cat': {
				const { stdout, stderr } = this.handleCat(cwd, args)
				result.stdout = stdout
				result.stderr = stderr
				return result
			}
			case 'mkdir': {
				const { stdout, stderr } = this.handleMkdir(cwd, args)
				result.stdout = stdout
				result.stderr = stderr
				return result
			}
			default:
				return { handled: false, cwd }
		}
	}
}

type SpawnRemoteProcessParams = {
	argv?: unknown[]
	entry: string
	env?: Record<string, string>
	cwd?: string
	columns?: number
	rows?: number
	name?: string
}

type ProcessErrorDetail = {
	name: string
	message: string
	stack?: string
	code?: string
}

type RemoteProcessHandle = {
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions
	): void
	waitForExit(): Promise<NodeProcessExitInfo>
	write(data: string): void
	end(): void
	resize(columns: number, rows: number): void
	signal(signal?: string): void
	terminate(): void
}

function serializeProcessError(error: unknown): ProcessErrorDetail {
	if (error instanceof Error) {
		const detail: ProcessErrorDetail = {
			name: error.name || 'Error',
			message: error.message || 'Unknown error',
		}
		if (typeof error.stack === 'string') {
			detail.stack = error.stack
		}
		const code = (error as any)?.code
		if (typeof code === 'string' && code.length > 0) {
			detail.code = code
		}
		return detail
	}
	return {
		name: 'Error',
		message:
			typeof error === 'string'
				? error
				: String(error ?? 'Unknown error'),
	}
}

class MainWorker {
	constructor() {
		this.filesystem = globalThis.globalFs
		this.shell = new ShellCommandExecutor(this.filesystem)
	}

	async initDemoFilesystem() {
		await initFiles(this.filesystem)
	}

	createFilesystemClientPort() {
		const port = createFilesystemPort()
		return Comlink.transfer(port, [port])
	}

	async changeDirectory(cwd, target) {
		const result = this.shell.changeDirectory(cwd, target, {
			throwOnError: true,
		})
		return result.cwd
	}

	async executeShellCommand(payload) {
		const cwd = payload?.cwd ?? '/'
		const command = payload?.command ?? ''
		const args = Array.isArray(payload?.args) ? payload.args : []
		return this.shell.execute(cwd, command, args)
	}

	async spawnRemoteProcess(
		params: SpawnRemoteProcessParams
	): Promise<RemoteProcessHandle> {
		const {
			argv = [],
			entry,
			env,
			cwd,
			columns,
			rows,
			name,
		} = params || ({} as SpawnRemoteProcessParams)

		if (typeof entry !== 'string' || entry.length === 0) {
			throw new Error(
				'spawnRemoteProcess: entry must be a non-empty string'
			)
		}

		const events = new EventTarget()
		const emit = (type: string, detail?: unknown) => {
			const event = new CustomEvent(type, { detail })
			events.dispatchEvent(event)
		}

		const handle = await spawnNodeProcess(
			argv,
			{
				entry,
				env,
				cwd,
				columns,
				rows,
				name,
				fsPort: createFilesystemPort(),
			},
			{
				onStdout: (text) => emit('stdout', text),
				onStderr: (text) => emit('stderr', text),
				onExit: (info) => emit('exit', info),
				onError: (error) => emit('error', serializeProcessError(error)),
				onReady: () => emit('ready'),
				onMessage: (data) => emit('message', data),
			}
		)

		return Comlink.proxy({
			addEventListener: (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions
			) => events.addEventListener(type, listener as any, options),
			removeEventListener: (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | EventListenerOptions
			) =>
				events.removeEventListener(type, listener as any, options),
			waitForExit: () => handle.waitForExit(),
			write: (data: string) => handle.write?.(data),
			end: () => handle.end?.(),
			resize: (columns: number, rows: number) =>
				handle.resize?.(columns, rows),
			signal: (signal?: string) => handle.signal?.(signal),
			terminate: () => handle.terminate?.(),
		}) as RemoteProcessHandle
	}
}

exposeAPI(new MainWorker(), self)
