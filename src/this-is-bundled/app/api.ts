import * as Comlink from './comlink-sync'
import { Dirent, Stats } from './in-memory-fs-classes.ts'
import * as ErrorSerializer from './serialize-error.ts'

export * from './comlink-sync'

Comlink.transferHandlers.set('EVENT', {
	canHandle: (obj): obj is CustomEvent => obj instanceof CustomEvent,
	serialize: (ev: CustomEvent) => {
		return [
			{
				detail: ev.detail,
			},
			[],
		]
	},
	deserialize: (obj) => obj,
})
Comlink.transferHandlers.set('FUNCTION', {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	canHandle: (obj: unknown): obj is Function => typeof obj === 'function',
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	serialize(obj: Function) {
		const { port1, port2 } = new MessageChannel()
		Comlink.expose(obj, port1)
		return [port2, [port2]]
	},
	deserialize(port: any) {
		port.start()
		return Comlink.wrap(port)
	},
})
Comlink.transferHandlers.set('MESSAGE_PORT', {
	canHandle: (obj: unknown): obj is MessagePort => obj instanceof MessagePort,
	serialize(port: MessagePort): [MessagePort, Transferable[]] {
		return [port, [port]]
	},
	deserialize(port: MessagePort): MessagePort {
		return port
	},
})
Comlink.transferHandlers.set('STATS', {
	canHandle: (obj): obj is Stats => obj instanceof Stats,
	serialize: (stats: Stats) => {
		return [
			{
				type: stats.type,
				mode: stats.mode,
				size: stats.size,
				atime: stats.atime,
				mtime: stats.mtime,
				ctime: stats.ctime,
				birthtime: stats.birthtime,
				atimeMs: stats.atimeMs,
				mtimeMs: stats.mtimeMs,
				ctimeMs: stats.ctimeMs,
				birthtimeMs: stats.birthtimeMs,
			},
			[],
		]
	},
	deserialize: (obj) => {
		const stats = Object.create(Stats.prototype)
		Object.assign(stats, obj)
		return stats
	},
})
Comlink.transferHandlers.set('DIRENT', {
	canHandle: (obj): obj is Dirent => obj instanceof Dirent,
	serialize: (dirent: Dirent) => {
		return [
			{
				name: dirent.name,
				type: dirent.type,
			},
			[],
		]
	},
	deserialize: (obj) => {
		const dirent = Object.create(Dirent.prototype)
		Object.assign(dirent, obj)
		return dirent
	},
})

// Augment Comlink's throw handler to include Error the response and source
// information in the serialized error object. BasePHP may throw
// PHPExecutionFailureError which includes those information and we'll want to
// display them for the user.
const throwHandler = Comlink.transferHandlers.get('throw')!
const originalSerialize = throwHandler?.serialize
throwHandler.serialize = ({ value }: any) => {
	const serialized = originalSerialize({ value }) as any
	if (value.response) {
		serialized[0].value.response = value.response
	}
	if (value.source) {
		serialized[0].value.source = value.source
	}
	return serialized
}

// Augment Comlink's throw handler to include all the information carried by
// the thrown object, including the cause, additional properties, etc.
interface UnserializedError {
	value: unknown
}
type SerializedError =
	| { isError: true; value: ErrorSerializer.ErrorObject }
	| { isError: false; value: unknown }

const throwTransferHandler = Comlink.transferHandlers.get(
	'throw'
) as Comlink.TransferHandler<UnserializedError, SerializedError>

const throwTransferHandlerCustom: Comlink.TransferHandler<
	UnserializedError,
	SerializedError
> = {
	canHandle: throwTransferHandler.canHandle,
	serialize: ({ value }) => {
		let serialized: SerializedError
		if (value instanceof Error) {
			serialized = {
				isError: true,
				value: ErrorSerializer.serializeError(value),
			}
			// The error class name is not serialized by serialize-error, let's add it manually.
			serialized.value['originalErrorClassName'] = value.constructor.name
		} else {
			serialized = { isError: false, value }
		}
		return [serialized, []]
	},
	deserialize: (serialized) => {
		if (serialized.isError) {
			const error = ErrorSerializer.deserializeError(serialized.value)
			/**
			 * The original error from the web worker does not include any call
			 * stack from the Playground web app. Let's include that information
			 * in the error chain.
			 *
			 * We'll place it at the bottom of the error chain. This way the API
			 * consumer gets the original error object and not an opaque
			 * "Comlink method call failed" error, but they can still inspect
			 * it further to see the full call stack.
			 */
			const additionalCallStack = new Error('Comlink method call failed')
			let deepestError = error
			while (deepestError.cause) {
				deepestError = deepestError.cause
			}
			deepestError.cause = additionalCallStack
			throw error
		}
		throw serialized.value
	},
}

Comlink.transferHandlers.set('throw', throwTransferHandlerCustom)
