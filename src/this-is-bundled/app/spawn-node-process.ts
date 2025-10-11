const workerScriptUrl = new URL('./node-process.worker.js', import.meta.url)

let processCounter = 0

function sanitizeArgv(argv) {
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

function sanitizeEnv(env) {
	const result = {}
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

function toInteger(value, fallback) {
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

export async function spawnNodeProcess(
    argv = [],
    options = {},
    callbacks = {}
): Promise<SpawnedNodeProcessHandle> {
	const normalizedArgv = sanitizeArgv(argv)
	const entry = options.entry
	if (!entry || typeof entry !== 'string') {
		throw new Error(
			'spawnNodeProcess: options.entry must be a non-empty string.'
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

	let exitResolve
	let exitReject
	const exitPromise = new Promise((resolve, reject) => {
		exitResolve = resolve
		exitReject = reject
	})

	worker.onmessage = (event) => {
		const data = event.data || {}
		switch (data.type) {
			case 'stdout':
				if (typeof callbacks.onStdout === 'function') {
					callbacks.onStdout(String(data.data ?? ''))
				}
				break
			case 'stderr':
				if (typeof callbacks.onStderr === 'function') {
					callbacks.onStderr(String(data.data ?? ''))
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
				if (typeof callbacks.onExit === 'function') {
					callbacks.onExit(exitInfo)
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
				if (typeof callbacks.onError === 'function') {
					callbacks.onError(error)
				}
				exitReject(error)
				break
			}
			case 'ready':
				if (typeof callbacks.onReady === 'function') {
					callbacks.onReady()
				}
				break
			default:
				if (typeof callbacks.onMessage === 'function') {
					callbacks.onMessage(data)
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
					: { message: String(event?.message ?? 'Unknown worker error') }
			console.error('Node process worker error:', details)
		}
		const error =
			event instanceof ErrorEvent && event.error instanceof Error
				? event.error
				: new Error('Node worker execution failed')
		if (typeof callbacks.onError === 'function') {
			callbacks.onError(error)
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
				entry,
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
		if (typeof callbacks.onError === 'function') {
			callbacks.onError(err)
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
