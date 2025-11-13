import { Kernel } from '@adamziel/kernel/runtime/index.ts';
import { joinPaths } from '@adamziel/kernel/runtime/util/paths.ts';
import { nodeProgramSource } from './node.ts';

// @ts-ignore
import npmProgramSource from './npm/npm-single.js?loader=text';
// @ts-ignore
import defaultInputProgramSource from './npm/default-input.js?loader=text';

export const programs: Record<string, string> = {
	node: nodeProgramSource,
};

export type ProgramName = keyof typeof programs;

// Initiate programs
const EXPORT_DEFAULT_PATTERN = /\bexport\s+default\b/;

const wrapProgramModule = (source: string): string => {
	if (EXPORT_DEFAULT_PATTERN.test(source)) {
		return source;
	}
	const trimmed = source.trimEnd();
	return `export default async function __programModuleEntry(processController) {\n\treturn ${trimmed}\n}`;
};

export function installNodeJs(kernel: Kernel, path = '/bin') {
	kernel.mkdirSync(path, { mode: 0o755, recursive: true });
	for (const [name, source] of Object.entries(programs)) {
		const wrapped = wrapProgramModule(source);
		kernel.writeFileSync(joinPaths(path, name), `${wrapped}\n`, {
			mode: 0o755,
		});
	}
	kernel.writeFileSync(joinPaths(path, 'npm'), `${npmProgramSource}\n`, {
		mode: 0o755,
	});
	kernel.writeFileSync(
		joinPaths(path, 'default-input.js'),
		`${defaultInputProgramSource}\n`,
		{
			mode: 0o755,
		}
	);

	kernel.mkdirSync('/home/user/.npm/_cacache', { recursive: true });

	// npm really wants to see a module called `node-gyp` in the filesystem,
	// even if it doesn't actually run it.
	// @TODO: Find a better location for a global node_modules directory.
	kernel.mkdirSync('/node_modules/node-gyp/bin', { recursive: true });
	kernel.writeFileSync('/node_modules/node-gyp/package.json', '{}', {
		mode: 0o755,
	});
	kernel.writeFileSync('/node_modules/node-gyp/bin/node-gyp.js', '', {
		mode: 0o755,
	});
}
