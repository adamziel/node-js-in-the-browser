declare const processController: any;

const runnerModuleUrl = new URL('../shell/run.js', import.meta.url).href;
const parserModuleUrl = new URL('../shell/sh.js', import.meta.url).href;
const utilsModuleUrl = new URL('./lib/utils.js', import.meta.url).href;

const createProgramSource = (): string => {
	const program = async function main(urls: {
		runUrl: string;
		parseUrl: string;
		utilsUrl: string;
	}): Promise<void> {
		const { errorToString, exitSafely, getArgv, writeStderr } =
			await import(/* @vite-ignore */ urls.utilsUrl);

		try {
			const argv = getArgv();
			if (argv.length === 0) {
				writeStderr('sh: expected a script path or "-c <command>"');
				exitSafely(1);
				return;
			}
			const fs = processController.fsSync;
			const decoder = new TextDecoder();

			let source: string;
			let scriptLabel: string;
			if (argv[0] === '-c') {
				if (argv.length < 2) {
					writeStderr('sh: -c: expected a command string');
					exitSafely(1);
					return;
				}
				source = argv[1] ?? '';
				scriptLabel = '-c';
			} else if (argv.length === 1) {
				const scriptPath = argv[0];
				scriptLabel = scriptPath;
				try {
					const data = fs.readFileSync(scriptPath, 'utf8');
					source =
						typeof data === 'string'
							? data
							: decoder.decode(data as Uint8Array);
				} catch (error) {
					writeStderr(
						`sh: ${scriptPath}: ${errorToString(error)}`
					);
					exitSafely(1);
					return;
				}
			} else {
				writeStderr(
					'sh: expected exactly one script path or "-c <command>"'
				);
				exitSafely(1);
				return;
			}

			let runShellScript: (
				pc: typeof processController,
				root: unknown
			) => Promise<number>;
			let parseShellCode: (code: string) => unknown;
			try {
				const [{ runShellScript: run }, { parseShellCode: parse }] =
					await Promise.all([
						import(/* @vite-ignore */ urls.runUrl),
						import(/* @vite-ignore */ urls.parseUrl),
					]);
				runShellScript = run!;
				parseShellCode = parse!;
			} catch (error) {
				writeStderr(
					`sh: failed to load shell runtime: ${errorToString(error)}`
				);
				exitSafely(1);
				return;
			}

			let ast: unknown;
			try {
				ast = parseShellCode(source);
			} catch (error) {
				writeStderr(`sh: ${scriptLabel}: ${errorToString(error)}`);
				exitSafely(2);
				return;
			}

			try {
				const exitCode = await runShellScript(processController, ast);
				exitSafely(exitCode);
			} catch (error) {
				writeStderr(`sh: ${errorToString(error)}`);
				exitSafely(1);
			}
		} catch (error) {
			writeStderr(`sh: ${errorToString(error)}`);
			exitSafely(1);
		}
	};

	return `(${program.toString()})(${JSON.stringify({
		runUrl: runnerModuleUrl,
		parseUrl: parserModuleUrl,
		utilsUrl: utilsModuleUrl,
	})});`;
};

export const shProgramSource = createProgramSource();
