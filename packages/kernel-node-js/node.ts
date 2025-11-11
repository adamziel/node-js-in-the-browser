declare const processController: {
	argv(): string[];
	exit(code: number): void;
	getEnv?(name: string): string;
};

const nodeLoaderUrl = new URL('./node-loader.ts', import.meta.url).href;

const createProgramSource = (): string => {
	const program = async function main(urls: { nodeLoaderUrl: string }) {
		var getStream = (name) => {
			const stream = processController?.[name];
			if (stream && typeof stream.write === 'function') {
				return stream;
			}
			return null;
		};
		var writeToStream = (stream, fallback, message, appendNewline) => {
			const chunk =
				appendNewline && !message.endsWith('\n')
					? `${message}
		`
					: message;
			if (stream) {
				stream.write(chunk);
			} else {
				fallback(chunk);
			}
		};
		function getArgv() {
			const raw = processController.argv();
			return Array.isArray(raw) ? raw.slice(1) : [];
		}
		function writeStdout(message, options = {}) {
			const { appendNewline = true } = options;
			writeToStream(
				getStream('stdout'),
				console.log,
				message,
				appendNewline
			);
		}
		function writeStderr(message, options = {}) {
			const { appendNewline = true } = options;
			writeToStream(
				getStream('stderr'),
				console.error,
				message,
				appendNewline
			);
		}
		function exitSafely(code) {
			try {
				processController.exit(code);
			} catch {}
		}
		function errorToString(error) {
			return error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
				? error.message
				: String(error ?? 'Unknown error');
		}

		try {
			let loaderUrl = urls.nodeLoaderUrl;
			try {
				const override =
					typeof processController?.getEnv === 'function'
						? processController.getEnv('NODE_LOADER_URL')
						: '';
				if (override && override.length > 0) {
					loaderUrl = override;
				}
			} catch {
				// Ignore env lookup failures.
			}
			const { loadNode } = await import(/* @vite-ignore */ loaderUrl);
			const runtime = await loadNode();
			await runtime.runMain();
			// We can't just exit for the process – this would kill it
			// even when it starts async work, e.g. npm install.
			// We also can't not exit for the process – this would keep it
			// running even when there's no more work to do.
			// @TODO: How can we ensure all the Node scripts exit at the
			//        end once there's no more pending timers or sockets?
			// For now, return a Promise that never resolves - the script
			// must explicitly call processController.exit()
			return new Promise(() => {});
		} catch (error) {
			console.trace(error);
			writeStderr(`node: <internal>: ${errorToString(error)}`);
			// See above.
			// exitSafely(1)
			return new Promise(() => {}); // Don't exit automatically even on error
		}
	};

	return `(${program.toString()})(${JSON.stringify({
		nodeLoaderUrl,
	})});`;
};

export const nodeProgramSource = createProgramSource();
