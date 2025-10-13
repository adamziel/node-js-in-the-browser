let processCounter = 0

function sanitizeArgv(argv: string[]) {
	if (!Array.isArray(argv)) {
		throw new TypeError('spawnNodeProcess: argv must be an array.')
	}
	return argv.map((value) => {
		if (value == null) {
			return ''
		}
		return String(value)
	})
}

function sanitizeEnv(env: Record<string, string>) {
	const result: Record<string, string> = {}
	if (!env || typeof env !== 'object') {
		return result
	}
	for (const [key, value] of Object.entries(env)) {
		if (typeof key !== 'string' || key.length === 0) {
			continue
		}
		result[key] = value == null ? '' : String(value)
	}
	return result
}

function toInteger(value: string, fallback: number) {
	const number = Number.parseInt(value, 10)
	return Number.isInteger(number) && number > 0 ? number : fallback
}

export type NodeProcessExitInfo = {
	code: number
	signal: string | null
}

export type SpawnedNodeProcessHandle = {
	waitForExit(): Promise<NodeProcessExitInfo>
	write(data: string): void
	end(): void
	resize(cols: number, rows: number): void
	signal(signal?: string): void
	terminate(): void
}

export type SpawnNodeProcessOptions = {
	env?: Record<string, string>
	cwd?: string
	columns?: number
	rows?: number
	name?: string
	fsPort: MessagePort
	onStdout?: (text: string) => void
	onStderr?: (text: string) => void
	onExit?: (info: NodeProcessExitInfo) => void
	onError?: (error: Error) => void
	onReady?: () => void
	onMessage?: (data: unknown) => void
}

export async function spawnNodeProcess(
	argv = [],
	options = {} as SpawnNodeProcessOptions
): Promise<SpawnedNodeProcessHandle> {
	const normalizedArgv = sanitizeArgv(argv)
	const entry =
		typeof normalizedArgv[1] === 'string' && normalizedArgv[1].length
			? normalizedArgv[1]
			: undefined
	if (!entry) {
		throw new Error(
			'spawnNodeProcess: argv must include a script path at index 1.'
		)
	}

	const env = sanitizeEnv(options.env)
	const cwd =
		typeof options.cwd === 'string' && options.cwd ? options.cwd : '/'
	const columns = toInteger(options.columns, 80)
	const rows = toInteger(options.rows, 24)
	const name =
		typeof options.name === 'string' && options.name.length
			? options.name
			: `node-process-${++processCounter}`

	const worker = new Worker('/dist/app/node-process.worker.js', {
		type: 'module',
		name,
	})

	let settled = false

	const cleanup = () => {
		if (settled) {
			return
		}
		settled = true
		worker.onmessage = null
		worker.onerror = null
	}

	let exitResolve: (value: NodeProcessExitInfo) => void
	let exitReject: (reason?: any) => void
	const exitPromise = new Promise((resolve, reject) => {
		exitResolve = resolve
		exitReject = reject
	})

	worker.onmessage = (event) => {
		const data = event.data || {}
		switch (data.type) {
			case 'stdout':
				if (typeof options.onStdout === 'function') {
					options.onStdout(String(data.data ?? ''))
				}
				break
			case 'stderr':
				if (typeof options.onStderr === 'function') {
					options.onStderr(String(data.data ?? ''))
				}
				break
			case 'exit': {
				cleanup()
				const exitInfo = {
					code:
						typeof data.code === 'number' &&
						Number.isInteger(data.code)
							? data.code
							: 0,
					signal:
						typeof data.signal === 'string' && data.signal.length
							? data.signal
							: null,
				}
				if (typeof options.onExit === 'function') {
					options.onExit(exitInfo)
				}
				exitResolve(exitInfo)
				break
			}
			case 'error': {
				cleanup()
				const error =
					data.error instanceof Error
						? data.error
						: new Error(
								typeof data.message === 'string'
									? data.message
									: 'Unknown node process error'
						  )
				if (typeof options.onError === 'function') {
					options.onError(error)
				}
				exitReject(error)
				break
			}
			case 'ready':
				if (typeof options.onReady === 'function') {
					options.onReady()
				}
				break
			default:
				if (typeof options.onMessage === 'function') {
					options.onMessage(data)
				}
				break
		}
	}

	worker.onerror = (event) => {
		cleanup()
		if (typeof console !== 'undefined') {
			const details =
				event instanceof ErrorEvent
					? {
							message: event.message,
							filename: event.filename,
							lineno: event.lineno,
							colno: event.colno,
							error: event.error,
					  }
					: ({
							message: String(
								event?.message ?? 'Unknown worker error'
							),
					  } as any)
			console.error('Node process worker error:', details)
		}
		const error =
			event instanceof ErrorEvent && event.error instanceof Error
				? event.error
				: new Error('Node worker execution failed')
		if (typeof options.onError === 'function') {
			options.onError(error)
		}
		exitReject(error)
	}

	worker.addEventListener('messageerror', (event) => {
		console.error('Node process worker messageerror:', event)
	})

	const start = async () => {
		worker.postMessage(
			{
				type: 'start',
				argv: normalizedArgv,
				env,
				cwd,
				columns,
				rows,
				name,
				fsPort: options.fsPort,
			},
			[options.fsPort]
		)
	}

	await start().catch((error) => {
		cleanup()
		const err =
			error instanceof Error
				? error
				: new Error(String(error ?? 'Unknown error'))
		if (typeof options.onError === 'function') {
			options.onError(err)
		}
		exitReject(err)
	})

	return {
		waitForExit() {
			return exitPromise
		},
		write(data) {
			if (settled) return
			worker.postMessage({
				type: 'stdin',
				data: typeof data === 'string' ? data : String(data ?? ''),
			})
		},
		end() {
			if (settled) return
			worker.postMessage({ type: 'stdin-end' })
		},
		resize(cols, rows) {
			if (settled) return
			worker.postMessage({
				type: 'resize',
				columns: toInteger(cols, columns),
				rows: toInteger(rows, rows),
			})
		},
		signal(signal = 'SIGTERM') {
			if (settled) return
			const payload =
				typeof signal === 'string' && signal.length ? signal : 'SIGTERM'
			worker.postMessage({ type: 'signal', signal: payload })
		},
		terminate() {
			if (settled) return
			cleanup()
			worker.terminate()
			exitReject(new Error('Process terminated'))
		},
	}
}
