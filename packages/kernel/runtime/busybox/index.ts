import { lsProgramSource } from './ls.ts'
import { mkdirProgramSource } from './mkdir.ts'
import { cpProgramSource } from './cp.ts'
import { mvProgramSource } from './mv.ts'
import { rmProgramSource } from './rm.ts'
import { touchProgramSource } from './touch.ts'
import { catProgramSource } from './cat.ts'
import { echoProgramSource } from './echo.ts'
import { headProgramSource } from './head.ts'
import { tailProgramSource } from './tail.ts'
import { envProgramSource } from './env.ts'
import { lnProgramSource } from './ln.ts'
import { pwdProgramSource } from './pwd.ts'
import { cdProgramSource } from './cd.ts'
import { shProgramSource } from './sh.ts'
import { clearProgramSource } from './clear.ts'
import { type Kernel } from '../index.ts'
import { joinPaths } from '../util/paths.ts'
import { ttyShellProgramSource } from './tty-shell.ts'

export const busyboxPrograms: Record<string, string> = {
	ls: lsProgramSource,
	mkdir: mkdirProgramSource,
	cp: cpProgramSource,
	mv: mvProgramSource,
	rm: rmProgramSource,
	touch: touchProgramSource,
	cat: catProgramSource,
	echo: echoProgramSource,
	head: headProgramSource,
	tail: tailProgramSource,
	env: envProgramSource,
	ln: lnProgramSource,
	pwd: pwdProgramSource,
	cd: cdProgramSource,
	sh: shProgramSource,
	clear: clearProgramSource,
	'tty-shell': ttyShellProgramSource,
}

export type BusyboxProgramName = keyof typeof busyboxPrograms

// Initiate busybox programs
const EXPORT_DEFAULT_PATTERN = /\bexport\s+default\b/

const wrapProgramModule = (source: string): string => {
	if (EXPORT_DEFAULT_PATTERN.test(source)) {
		return source
	}
	const trimmed = source.trimEnd()
	return `export default async function __busyboxModuleEntry(processController) {\n\treturn ${trimmed}\n}`
}

export function installBusybox(kernel: Kernel, path = '/bin') {
	kernel.mkdirSync(path, { mode: 0o755, recursive: true })
	let envExecutableSource: string | null = null

	for (const [name, source] of Object.entries(busyboxPrograms)) {
		const wrapped = wrapProgramModule(source)
		const content = `${wrapped}\n`
		kernel.writeFileSync(joinPaths(path, name), content, {
			mode: 0o755,
		})

		if (name === 'env') {
			envExecutableSource = content
		}
	}

	if (envExecutableSource) {
		try {
			kernel.mkdirSync('/usr/bin', { mode: 0o755, recursive: true })
			kernel.writeFileSync('/usr/bin/env', envExecutableSource, {
				mode: 0o755,
			})
		} catch {
			// ignore inability to create /usr/bin/env (read-only or custom FS)
		}
	}
}
