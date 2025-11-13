declare const processController: any

const utilsModuleUrl = new URL('./lib/utils.js', import.meta.url).href

const createProgramSource = (): string => {
	const program = async function main(urls: {
		utilsModuleUrl: string
	}): Promise<void> {
		const { exitSafely, writeStdout } = await import(
			/* @vite-ignore */ urls.utilsModuleUrl
		)

		// ANSI escape sequence to clear screen and move cursor to top-left
		writeStdout('\x1b[2J\x1b[H', { appendNewline: false })
		exitSafely(0)
	}

	return `(${program.toString()})(${JSON.stringify({
		utilsModuleUrl,
	})});`
}

export const clearProgramSource = createProgramSource()
