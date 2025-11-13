type GitFsReadFileOptions =
	| { encoding?: string | null }
	| string
	| null
	| undefined;

/**
 * Decode a Uint8Array returned from the kernel file system into the shape that
 * isomorphic-git expects. It mirrors Node's fs.readFile behavior by returning
 * strings when an encoding is requested and raw bytes otherwise.
 */
export function decodeGitFsResult(
	data: Uint8Array,
	options?: GitFsReadFileOptions
): Uint8Array | string {
	const encoding = pickEncoding(options);
	if (!encoding) {
		return data;
	}

	const normalized = normalizeEncoding(encoding);

	try {
		return new TextDecoder(normalized).decode(data);
	} catch (error) {
		console.warn(
			`[Git FS] Unsupported encoding "${encoding}", defaulting to utf-8`,
			error
		);
		return new TextDecoder('utf-8').decode(data);
	}
}

export type { GitFsReadFileOptions };

function pickEncoding(
	options?: GitFsReadFileOptions
): string | undefined {
	if (!options) {
		return undefined;
	}

	if (typeof options === 'string') {
		return treatAsBinary(options) ? undefined : options;
	}

	const encoding = options.encoding ?? undefined;
	if (!encoding) {
		return undefined;
	}

	return treatAsBinary(encoding) ? undefined : encoding;
}

const encodingAliases: Record<string, string> = {
	utf8: 'utf-8',
	'utf-8': 'utf-8',
	utf16le: 'utf-16le',
	'utf-16le': 'utf-16le',
	utf16be: 'utf-16be',
	'utf-16be': 'utf-16be',
	ucs2: 'utf-16le',
	'ucs-2': 'utf-16le',
	latin1: 'iso-8859-1',
	'iso-8859-1': 'iso-8859-1',
};

function normalizeEncoding(encoding: string): string {
	const key = encoding.toLowerCase();
	return encodingAliases[key] ?? key;
}

function treatAsBinary(value: string): boolean {
	const normalized = value.toLowerCase();
	return normalized === 'buffer' || normalized === 'binary';
}
