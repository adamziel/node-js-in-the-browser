'use strict'
import { initFiles } from './init-demo-fs.js'
import { spawnNodeProcess } from './spawn-node-process.js'
import { RemoteInMemoryFileSystem } from './in-memory-fs.client.js'


// Create and attach the filesystem worker
const fsWorker = await new Promise((resolve) => {
	const fsWorkerUrl = new URL(
		'/src/this-is-imported-directly/in-memory-fs.worker.js',
		import.meta.url
	)
	const fsWorker = new Worker(fsWorkerUrl, {
		type: 'module',
		name: 'InMemoryFileSystem',
	})

	fsWorker.onerror = (...args) => {
		console.log('Filesystem worker error:', args)
	}

	fsWorker.onmessage = (event) => {
		if (event.data === 'ready') {
			console.log('Filesystem worker initialized')
			resolve(fsWorker)
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
			const wrapped = new Error(message)
			wrapped.code = code
			wrapped.originalError = error
			wrapped.cwd = cwd
			if (throwOnError) {
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
				err.push(`${this.formatFsError('ls', target, error)}\n`)
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
					err.push(`mkdir: ${target}: No such file or directory\n`)
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
				err.push(`${this.formatFsError('cat', arg, error)}\n`)
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

class MainWorker {
	constructor() {
		this.filesystem = globalThis.globalFs
		this.shell = new ShellCommandExecutor(this.filesystem)
	}

	async initDemoFilesystem() {
		await initFiles(this.filesystem)
	}

	spawnNodeProcess(argv, options = {}, callbacks = {}) {
		return spawnNodeProcess(
			argv,
			{
				...options,
				fsPort: createFilesystemPort(),
			},
			callbacks
		)
	}

	createFilesystemClientPort() {
		return createFilesystemPort()
	}

	async changeDirectory(cwd, target) {
		const { cwd: nextCwd } = this.shell.changeDirectory(cwd, target, {
			throwOnError: true,
		})
		return nextCwd
	}

	async executeShellCommand({ cwd, command, args }) {
		const normalizedArgs = Array.isArray(args) ? args : []
		return this.shell.execute(cwd, command, normalizedArgs)
	}
}

const workerInstance = new MainWorker()

function serializeError(error) {
	if (error instanceof Error) {
		return {
			message: error.message,
			name: error.name,
			stack: error.stack,
		}
	}
	if (error && typeof error === 'object') {
		try {
			return { message: JSON.stringify(error) }
		} catch (_err) {
			return { message: String(error) }
		}
	}
	return { message: String(error ?? 'Unknown error') }
}

function respondSuccess(id, result = null, transferables = []) {
	self.postMessage(
		{
			id,
			ok: true,
			result,
		},
		transferables
	)
}

function respondError(id, error) {
	self.postMessage({
		id,
		ok: false,
		error: serializeError(error),
	})
}

function safePost(port, message) {
	try {
		port.postMessage(message)
	} catch (error) {
		console.error('Failed to post message to main thread', error)
	}
}

self.addEventListener('message', async (event) => {
	const data = event.data || {}
	const { id, type, payload } = data
	if (typeof id !== 'number' || !type) {
		return
	}

	try {
		switch (type) {
			case 'init-demo-filesystem': {
				await workerInstance.initDemoFilesystem()
				respondSuccess(id, null)
				break
			}
			case 'create-filesystem-port': {
				const port = workerInstance.createFilesystemClientPort()
				respondSuccess(id, { port }, [port])
				break
			}
			case 'change-directory': {
				const nextCwd = await workerInstance.changeDirectory(
					payload?.cwd,
					payload?.target
				)
				respondSuccess(id, { cwd: nextCwd })
				break
			}
			case 'execute-shell-command': {
				const result = await workerInstance.executeShellCommand(
					payload || {}
				)
				respondSuccess(id, result)
				break
			}
			case 'spawn-node-process': {
				const embeddedPort =
					payload && payload.eventPort instanceof MessagePort
						? payload.eventPort
						: null
				const eventPort =
					embeddedPort ??
					(event.ports && event.ports[0] instanceof MessagePort
						? event.ports[0]
						: null)
				if (!(eventPort instanceof MessagePort)) {
					throw new Error(
						'spawn-node-process message requires an event MessagePort'
					)
				}
				const argv = Array.isArray(payload?.argv)
					? payload.argv
					: []
				const options =
					payload && typeof payload.options === 'object'
						? payload.options
						: {}

				const callbacks = {
					onStdout: (text) =>
						safePost(eventPort, {
							type: 'stdout',
							data: String(text ?? ''),
						}),
					onStderr: (text) =>
						safePost(eventPort, {
							type: 'stderr',
							data: String(text ?? ''),
						}),
					onError: (error) =>
						safePost(eventPort, {
							type: 'error',
							message:
								error instanceof Error
									? error.message
									: String(error ?? 'Unknown error'),
							stack:
								error instanceof Error
									? error.stack
									: undefined,
						}),
					onExit: (info) =>
						safePost(eventPort, {
							type: 'exit',
							info,
						}),
				}

				let handle
				try {
					handle = workerInstance.spawnNodeProcess(
						argv,
						options,
						callbacks
					)
				} catch (error) {
					safePost(eventPort, {
						type: 'error',
						message:
							error instanceof Error
								? error.message
								: String(error ?? 'Unknown error'),
						stack:
							error instanceof Error ? error.stack : undefined,
					})
					throw error
				}

				const commandChannel = new MessageChannel()
				const commandPort = commandChannel.port1
				const commandPortForMain = commandChannel.port2

				const forwardCommandError = (error) => {
					safePost(eventPort, {
						type: 'error',
						message:
							error instanceof Error
								? error.message
								: String(error ?? 'Unknown error'),
						stack:
							error instanceof Error ? error.stack : undefined,
					})
				}

				commandPort.onmessage = (commandEvent) => {
					const message = commandEvent.data || {}
					try {
						switch (message.type) {
							case 'write':
								handle.write?.(message.data ?? '')
								break
							case 'end':
								handle.end?.()
								break
							case 'resize':
								handle.resize?.(
									message.columns,
									message.rows
								)
								break
							case 'signal':
								handle.signal?.(message.signal)
								break
							case 'terminate':
								handle.terminate?.()
								break
							default:
								break
						}
					} catch (error) {
						forwardCommandError(error)
					}
				}

				commandPort.start()
				eventPort.start()

				safePost(eventPort, { type: 'ready' })

				const exitPromise =
					typeof handle.waitForExit === 'function'
						? handle.waitForExit()
						: Promise.resolve({ code: 0, signal: null })

				exitPromise
					.catch((error) => {
						forwardCommandError(error)
					})
					.finally(() => {
						commandPort.onmessage = null
						try {
							commandPort.close()
						} catch (_error) {}
						try {
							eventPort.close()
						} catch (_error) {}
					})

				respondSuccess(id, { commandPort: commandPortForMain }, [
					commandPortForMain,
				])
				break
			}
			default:
				throw new Error(`Unknown worker request type: ${type}`)
		}
	} catch (error) {
		respondError(id, error)
	}
})
