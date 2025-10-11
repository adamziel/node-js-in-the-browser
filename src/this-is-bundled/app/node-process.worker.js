import { RemoteInMemoryFileSystem } from './in-memory-fs.client.js'
import { spawnNodeProcess } from './spawn-node-process.ts'

self.addEventListener('unhandledrejection', (event) => {
	const reason = event?.reason
	const stack =
		reason instanceof Error && typeof reason.stack === 'string'
			? reason.stack
			: undefined
	const message =
		reason instanceof Error
			? reason.message
			: String(reason ?? 'Unhandled rejection')
	try {
		self.postMessage({
			type: 'worker-error',
			message,
			stack,
		})
	} catch (_error) {
		console.error('Error posting worker-error:', _error)
		// ignore if posting fails
	}
	event.preventDefault()
})

self.addEventListener('error', (event) => {
	const payload = {
		type: 'worker-error',
		message:
			event && typeof event.message === 'string'
				? event.message
				: 'Worker runtime error',
		filename: event?.filename,
		lineno: event?.lineno,
		colno: event?.colno,
		stack:
			event?.error && typeof event.error.stack === 'string'
				? event.error.stack
				: undefined,
	}
	try {
		self.postMessage(payload)
	} catch (_error) {
		console.error('Error posting worker-error:', _error)
		// ignore if posting fails
	}
})

globalThis.global = globalThis
if (!('window' in globalThis)) {
	globalThis.window = globalThis
}
globalThis.spawnNodeProcess = spawnNodeProcess

const previousFetch = globalThis.fetch
globalThis.fetch = async (url, ...args) => {
	const parsed = new URL(url, window.location.href)
	if (parsed.hostname === window.location.hostname) {
		return previousFetch(url, ...args)
	}

	if (typeof url === 'string' && url.startsWith('https://')) {
		url = `${window.corsProxyUrl}?${url}`
	}

	let result = await previousFetch(url, ...args)

	// Strip content-encoding header to prevent npm from trying
	// to decompress the already-decompressed fetch() response.
	if (result.headers.has('content-encoding')) {
		const newHeaders = new Headers(result.headers)
		newHeaders.delete('content-encoding')

		result = new Response(result.body, {
			status: result.status,
			statusText: result.statusText,
			headers: newHeaders,
		})
	}

	return result
}

class ProcessExitError extends Error {
	constructor(code = 0) {
		super(`Process exited with code ${code}`)
		this.code = typeof code === 'number' ? code : 0
		this.name = 'ProcessExitError'
	}
}

const textDecoder = new TextDecoder()

function coerceToString(chunk, encoding) {
	if (typeof chunk === 'string') {
		return chunk
	}
	if (chunk instanceof ArrayBuffer) {
		return textDecoder.decode(new Uint8Array(chunk))
	}
	if (ArrayBuffer.isView(chunk)) {
		return textDecoder.decode(chunk)
	}
	if (chunk === undefined || chunk === null) {
		return ''
	}
	if (typeof chunk === 'object' && 'toString' in chunk) {
		return String(chunk)
	}
	return String(chunk ?? '')
}

let runMainRef = null
let runtimeReadyPromise = null
let globalFsInstance = null
let activeStreams = null
let cleanupEnvironment = null
let exitDispatched = false

let nextFsPortRequestId = 1
const pendingFsRequests = new Map()



function resolveFsPortRequest(data) {
	const entry = pendingFsRequests.get(data.requestId)
	if (!entry) {
		return
	}
	pendingFsRequests.delete(data.requestId)
	if (data.ok && data.port instanceof MessagePort) {
		entry.resolve(data.port)
		return
	}
	const message =
		typeof data.message === 'string'
			? data.message
			: 'Failed to obtain filesystem port'
	entry.reject(new Error(message))
}

async function ensureRuntimeInitialized(fsPort) {
	if (!(fsPort instanceof MessagePort)) {
		throw new TypeError(
			'Node process worker expected a MessagePort for filesystem access.'
		)
	}

	if (!globalFsInstance) {
		globalFsInstance = await RemoteInMemoryFileSystem.connect(fsPort)
	}

	if (!runtimeReadyPromise) {
		globalThis.__IN_MEMORY_FS_FACTORY__ = async () => globalFsInstance
		runtimeReadyPromise = import(
			'/src/this-is-imported-directly/client-boot.js'
		).then((module) => {
			if (typeof module.runMain !== 'function') {
				throw new Error('client-boot.js did not provide runMain.')
			}
			runMainRef = module.runMain
		})
	}

	await runtimeReadyPromise
}

function resetRuntimeState() {
	activeStreams = null
	cleanupEnvironment = null
	exitDispatched = false
}

function createTtyStreams(columns, rows) {
	const streamModule = globalThis.coreModules?.stream
	if (!streamModule) {
		throw new Error('stream module is not available in worker runtime')
	}
	const { Writable, Readable } = streamModule

	class WorkerWriteStream extends Writable {
		constructor(fd, channel) {
			super({ decodeStrings: false })
			this.fd = fd
			this.isTTY = true
			this.columns = columns
			this.rows = rows
			this._channel = channel
		}

		_write(chunk, encoding, callback) {
			try {
				const text = coerceToString(chunk, encoding)
				this._channel(text)
				callback()
			} catch (error) {
				callback(error)
			}
		}

		_emit(sequence) {
			if (sequence) {
				this._channel(sequence)
			}
		}

		cursorTo(x, y, callback) {
			let sequence = ''
			if (typeof y === 'number') {
				const row = Math.max(0, y) + 1
				const col = typeof x === 'number' ? Math.max(0, x) + 1 : 1
				sequence = `\u001b[${row};${col}H`
			} else if (typeof x === 'number') {
				const col = Math.max(0, x) + 1
				sequence = `\u001b[${col}G`
			}
			this._emit(sequence)
			if (typeof callback === 'function') {
				callback()
			}
			return true
		}

		moveCursor(dx, dy, callback) {
			if (dy) {
				const vertical = Math.abs(dy)
				const code = dy > 0 ? 'B' : 'A'
				this._emit(`\u001b[${vertical}${code}`)
			}
			if (dx) {
				const horizontal = Math.abs(dx)
				const code = dx > 0 ? 'C' : 'D'
				this._emit(`\u001b[${horizontal}${code}`)
			}
			if (typeof callback === 'function') {
				callback()
			}
			return true
		}

		clearLine(dir, callback) {
			const map = {
				'-1': '\u001b[1K',
				0: '\u001b[2K',
				1: '\u001b[0K',
			}
			this._emit(map[dir] ?? '\u001b[2K')
			if (typeof callback === 'function') {
				callback()
			}
			return true
		}

		clearScreenDown(callback) {
			this._emit('\u001b[0J')
			if (typeof callback === 'function') {
				callback()
			}
			return true
		}

		getColorDepth() {
			return 24
		}

		hasColors() {
			return true
		}

		getWindowSize() {
			return [this.columns, this.rows]
		}

		updateWindowSize(cols, newRows) {
			if (typeof cols === 'number') {
				this.columns = cols
			}
			if (typeof newRows === 'number') {
				this.rows = newRows
			}
			this.emit('resize')
		}
	}

	class WorkerReadStream extends Readable {
		constructor() {
			super({ read() {} })
			this.fd = 0
			this.isTTY = true
			this.isRaw = false
			this.columns = columns
			this.rows = rows
		}

		setRawMode(flag) {
			this.isRaw = !!flag
			return this
		}

		updateWindowSize(cols, newRows) {
			if (typeof cols === 'number') {
				this.columns = cols
			}
			if (typeof newRows === 'number') {
				this.rows = newRows
			}
			this.emit('resize')
		}

		writeFromTerminal(data) {
			if (!this.push(data)) {
				// Drop under backpressure
			}
		}

		endOfInput() {
			this.push(null)
		}

		resume() {
			super.resume()
			return this
		}

		pause() {
			super.pause()
			return this
		}
	}

	const stdout = new WorkerWriteStream(1, (chunk) =>
		postMessage({ type: 'stdout', data: chunk })
	)
	const stderr = new WorkerWriteStream(2, (chunk) =>
		postMessage({ type: 'stderr', data: chunk })
	)
	const stdin = new WorkerReadStream()

	const ttyModule = globalThis.coreModules?.tty
	if (ttyModule && typeof ttyModule.isatty === 'function') {
		if (!ttyModule.__webPolyfillsOriginalIsatty) {
			ttyModule.__webPolyfillsOriginalIsatty = ttyModule.isatty
			ttyModule.__webPolyfillsTtyFds = new Set()
			ttyModule.isatty = (fd) =>
				ttyModule.__webPolyfillsTtyFds.has(fd) ||
				ttyModule.__webPolyfillsOriginalIsatty(fd)
		}
		const fdSet = ttyModule.__webPolyfillsTtyFds
		fdSet.add(stdin.fd)
		fdSet.add(stdout.fd)
		fdSet.add(stderr.fd)
	}

	return {
		stdin,
		stdout,
		stderr,
		dispose() {
			if (ttyModule?.__webPolyfillsTtyFds) {
				const fdSet = ttyModule.__webPolyfillsTtyFds
				fdSet.delete(stdin.fd)
				fdSet.delete(stdout.fd)
				fdSet.delete(stderr.fd)
			}
		},
	}
}

function prepareEnvironment({ argv, env, cwd }) {
	const processObj = globalThis.process
	const utilModule = globalThis.coreModules?.util
	const format =
		typeof utilModule?.format === 'function'
			? utilModule.format
			: (...args) =>
					args
						.map((arg) =>
							typeof arg === 'string' ? arg : JSON.stringify(arg)
						)
						.join(' ')

	const previous = {
		argv: Array.isArray(processObj?.argv)
			? [...processObj.argv]
			: undefined,
		env: processObj?.env ? { ...processObj.env } : undefined,
		cwd: processObj?.cwd,
		chdir: processObj?.chdir,
		console: {
			log: console.log,
			info: console.info,
			warn: console.warn,
			error: console.error,
		},
		exit: processObj?.exit,
		abort: processObj?.abort,
	}

	const terminalAdapter = {
		writeStdout(message) {
			postMessage({ type: 'stdout', data: String(message) })
		},
		writeStderr(message) {
			postMessage({ type: 'stderr', data: String(message) })
		},
	}

	processObj?.setTerminal?.(terminalAdapter)

	console.log = (...args) => {
		postMessage({
			type: 'stdout',
			data: `${format(...args)}\n`,
		})
	}
	console.info = console.log
	console.warn = (...args) => {
		postMessage({
			type: 'stderr',
			data: `${format(...args)}\n`,
		})
	}
	console.error = console.warn

	if (processObj) {
		processObj.argv = Array.isArray(argv) ? [...argv] : []
		const targetEnv = processObj.env ?? {}
		for (const key of Object.keys(targetEnv)) {
			delete targetEnv[key]
		}
		if (env && typeof env === 'object') {
			for (const [key, value] of Object.entries(env)) {
				targetEnv[key] = value
			}
		}
		if (typeof processObj.chdir === 'function') {
			try {
				processObj.chdir(cwd)
			} catch {
				// ignore
			}
		}
		processObj.exit = (code = 0) => {
			throw new ProcessExitError(code)
		}
		processObj.abort = () => {
			throw new ProcessExitError(1)
		}
	}

	return () => {
		processObj?.setTerminal?.(null)
		console.log = previous.console.log
		console.info = previous.console.info
		console.warn = previous.console.warn
		console.error = previous.console.error
		if (processObj) {
			processObj.exit = previous.exit
			processObj.abort = previous.abort
			if (previous.argv) {
				processObj.argv = [...previous.argv]
			}
			if (previous.env) {
				const target = processObj.env ?? {}
				for (const key of Object.keys(target)) {
					delete target[key]
				}
				for (const [key, value] of Object.entries(previous.env)) {
					target[key] = value
				}
			}
			if (previous.cwd) {
				processObj.cwd = previous.cwd
			}
			if (previous.chdir) {
				processObj.chdir = previous.chdir
			}
		}
	}
}

function sendExit(code = 0, signal = null) {
	if (exitDispatched) {
		return
	}
	exitDispatched = true
	postMessage({ type: 'exit', code, signal })
}

function reportError(error) {
	const message =
		error instanceof Error
			? error.message || error.toString()
			: String(error ?? 'Unknown error')
	const stack = error instanceof Error ? error.stack : undefined
	postMessage({
		type: 'error',
		message,
		error: stack ? { message, stack } : undefined,
	})
}

async function runNodeProcess(config) {
	if (!config.entry || typeof config.entry !== 'string') {
		throw new Error('Node process worker requires an entry script path.')
	}
	try {
		await ensureRuntimeInitialized(config.fsPort)
		const { stdin, stdout, stderr, dispose } = createTtyStreams(
			config.columns,
			config.rows
		)
		activeStreams = { stdin, stdout, stderr, dispose }
		cleanupEnvironment = prepareEnvironment(config)

		const processObj = globalThis.process
		processObj?.initProcess?.({
			args: config.argv,
			cwd: config.cwd,
			stdin,
			stdout,
			stderr,
		})

		await runMainRef(config.entry)
		sendExit(0, null)
	} catch (error) {
		if (error instanceof ProcessExitError) {
			sendExit(error.code ?? 0, null)
		} else {
			reportError(error)
		}
	} finally {
		try {
			if (typeof cleanupEnvironment === 'function') {
				cleanupEnvironment()
			}
		} catch (cleanupError) {
			reportError(cleanupError)
		}
		if (activeStreams?.dispose) {
			try {
				activeStreams.dispose()
			} catch {
				// ignore
			}
		}
		resetRuntimeState()
	}
}

function handleStdin(data) {
	if (!activeStreams?.stdin) {
		return
	}
	activeStreams.stdin.writeFromTerminal(
		typeof data === 'string' ? data : String(data ?? '')
	)
}

function handleResize(columns, rows) {
	if (!activeStreams) {
		return
	}
	activeStreams.stdout?.updateWindowSize(columns, rows)
	activeStreams.stderr?.updateWindowSize(columns, rows)
	activeStreams.stdin?.updateWindowSize(columns, rows)
}

function handleSignal(signal) {
	if (!signal) {
		return
	}
	const processObj = globalThis.process
	if (typeof processObj?.emit === 'function') {
		processObj.emit(signal)
	}
	if (signal === 'SIGINT') {
		activeStreams?.stdin?.writeFromTerminal('\u0003')
	}
}

self.onmessage = (event) => {
	const data = event.data || {}
	switch (data.type) {
		case 'start':
			runNodeProcess({
				argv: Array.isArray(data.argv) ? data.argv : [],
				env: data.env && typeof data.env === 'object' ? data.env : {},
				cwd: typeof data.cwd === 'string' && data.cwd ? data.cwd : '/',
				entry: data.entry,
				columns:
					typeof data.columns === 'number' &&
					Number.isFinite(data.columns)
						? data.columns
						: 80,
				rows:
					typeof data.rows === 'number' && Number.isFinite(data.rows)
						? data.rows
						: 24,
				fsPort: data.fsPort instanceof MessagePort ? data.fsPort : null,
			}).catch((error) => {
				reportError(error)
			})
			break
		case 'stdin':
			handleStdin(data.data)
			break
		case 'stdin-end':
			if (activeStreams?.stdin) {
				activeStreams.stdin.endOfInput()
			}
			break
		case 'resize':
			handleResize(data.columns, data.rows)
			break
		case 'signal':
			handleSignal(
				typeof data.signal === 'string' && data.signal.length
					? data.signal
					: 'SIGTERM'
			)
			break
		case 'provide-fs-port':
			resolveFsPortRequest(data)
			break
		default:
			break
	}
}
