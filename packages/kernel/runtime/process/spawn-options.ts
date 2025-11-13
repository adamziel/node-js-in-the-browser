export type StdioMode = 'inherit' | 'ignore' | 'pipe'

export interface SpawnStdioOptions {
	stdin?: StdioMode
	stdout?: StdioMode
	stderr?: StdioMode
}

export interface TerminalSize {
	columns: number
	rows: number
}

export interface NormalizeSpawnOptionsDefaults {
	env?: Record<string, string>
	cwd?: string
	debug?: boolean
	terminalSize?: TerminalSize
}

export interface NormalizedSpawnOptions {
	argv: string[]
	env: Record<string, string>
	cwd: string
	name: string
	debug: boolean
	stdio?: SpawnStdioOptions
	timeout?: number
	ipcPort?: MessagePort
	workerThreadId?: number
	workerThreadName?: string
	fsConnector?: 'auto' | 'shared' | 'wasmfs'
	terminalSize?: TerminalSize
}

const sanitizeDimension = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value)
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value)
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed)
		}
	}
	return null
}

export const coerceTerminalSize = (
	value?: unknown
): TerminalSize | undefined => {
	if (!value || typeof value !== 'object') {
		return undefined
	}
	const source = value as { columns?: unknown; rows?: unknown }
	const columns = sanitizeDimension(source.columns)
	const rows = sanitizeDimension(source.rows)
	if (columns === null || rows === null) {
		return undefined
	}
	return { columns, rows }
}

const cloneEnvRecord = (
	env?: Record<string, string>
): Record<string, string> => {
	const cloned: Record<string, string> = {}
	if (!env) {
		return cloned
	}

	for (const [key, value] of Object.entries(env)) {
		cloned[key] = value
	}
	return cloned
}

export function normalizeStdioMode(
	mode: unknown
): StdioMode | undefined {
	if (mode === 'inherit' || mode === 'ignore' || mode === 'pipe') {
		return mode
	}
	return undefined
}

export function normalizeSpawnOptions(
	rawOptions: unknown,
	defaults: NormalizeSpawnOptionsDefaults = {}
): NormalizedSpawnOptions | null {
	if (!rawOptions || typeof rawOptions !== 'object') {
		return null
	}

	const value = rawOptions as Record<string, unknown>
	if (!Array.isArray(value.argv) || value.argv.length === 0) {
		return null
	}

	const argv = value.argv.map((arg) =>
		typeof arg === 'string' ? arg : String(arg)
	)

	const env = cloneEnvRecord(defaults.env)
	if (value.env && typeof value.env === 'object') {
		for (const [key, envValue] of Object.entries(
			value.env as Record<string, unknown>
		)) {
			env[key] =
				typeof envValue === 'string'
					? envValue
					: String(envValue ?? '')
		}
	}

	const defaultCwd =
		typeof defaults.cwd === 'string' ? defaults.cwd : '/'
	const cwd =
		typeof value.cwd === 'string' && value.cwd.length > 0
			? value.cwd
			: defaultCwd

	const name =
		typeof value.name === 'string' ? value.name : argv[0] ?? 'process'

	const stdio =
		value.stdio && typeof value.stdio === 'object'
			? {
					stdin: normalizeStdioMode(
						(value.stdio as SpawnStdioOptions).stdin
					),
					stdout: normalizeStdioMode(
						(value.stdio as SpawnStdioOptions).stdout
					),
					stderr: normalizeStdioMode(
						(value.stdio as SpawnStdioOptions).stderr
					),
			  }
			: undefined

	const debug =
		typeof value.debug !== 'undefined'
			? Boolean(value.debug)
			: Boolean(defaults.debug)

	const timeoutRaw = (value as Record<string, unknown>).timeout
	let timeout: number | undefined
	if (typeof timeoutRaw === 'number' && Number.isFinite(timeoutRaw)) {
		timeout = timeoutRaw >= 0 ? timeoutRaw : 0
	} else if (
		typeof timeoutRaw === 'string' &&
		timeoutRaw.trim().length > 0
	) {
		const parsed = Number(timeoutRaw)
		if (Number.isFinite(parsed)) {
			timeout = parsed >= 0 ? parsed : 0
		}
	}

	const candidatePort =
		(value.ipcPort as unknown) ?? (value.messagePort as unknown)
	const ipcPort =
		typeof candidatePort === 'object' &&
		candidatePort !== null &&
		'postMessage' in (candidatePort as MessagePort)
			? (candidatePort as MessagePort)
			: undefined

	const workerThreadId =
		typeof (value as { workerThreadId?: unknown }).workerThreadId ===
		'number'
			? (value as { workerThreadId: number }).workerThreadId
			: undefined

	const workerThreadNameRaw = (value as {
		workerThreadName?: unknown
	}).workerThreadName
	const workerThreadName =
		typeof workerThreadNameRaw === 'string'
			? workerThreadNameRaw
			: undefined

	const fsConnectorRaw = (value as { fsConnector?: unknown }).fsConnector
	let fsConnector: 'auto' | 'shared' | 'wasmfs' | undefined
	if (typeof fsConnectorRaw === 'string') {
		if (
			fsConnectorRaw === 'auto' ||
			fsConnectorRaw === 'shared' ||
			fsConnectorRaw === 'wasmfs'
		) {
			fsConnector = fsConnectorRaw
		}
	}

	const terminalSize =
		coerceTerminalSize(
			(value as { terminalSize?: unknown }).terminalSize
		) ?? defaults.terminalSize

	return {
		argv,
		env,
		cwd,
		name,
		debug,
		stdio,
		timeout,
		ipcPort,
		workerThreadId,
		workerThreadName,
		fsConnector,
		terminalSize,
	}
}
