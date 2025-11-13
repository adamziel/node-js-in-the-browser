import { Buffer } from 'buffer';

declare global {
	// eslint-disable-next-line no-var
	var Buffer: typeof Buffer | undefined;
}

if (typeof globalThis.Buffer === 'undefined') {
	(globalThis as any).Buffer = Buffer;
}
