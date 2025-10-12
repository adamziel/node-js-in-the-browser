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
Comlink.transferHandlers.set('fs.Stats', {
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
Comlink.transferHandlers.set('fs.Dirent', {
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

Comlink.transferHandlers.set('fs.WalkResult', {
	canHandle: (obj): obj is any =>
		!!obj &&
		typeof obj === 'object' &&
		'parent' in obj &&
		'node' in obj &&
		'name' in obj &&
		'segments' in obj,
	serialize: (walkResult: any) => {
		const serializeNode = (node) => {
			if (!node) return node
			if (node.type === 'dir') {
				return {
					...node,
					children: Array.from(node.children.entries()),
				}
			}
			return node
		}

		return [
			{
				parent: serializeNode(walkResult.parent),
				node: serializeNode(walkResult.node),
				name: walkResult.name,
				segments: walkResult.segments,
				blockedBy: serializeNode(walkResult.blockedBy),
				missingParent: walkResult.missingParent,
			},
			[],
		]
	},
	deserialize: (obj: any) => {
		const deserializeNode = (node) => {
			if (!node) return node
			if (node.type === 'dir' && Array.isArray(node.children)) {
				return {
					...node,
					children: new Map(node.children),
				}
			}
			return node
		}

		return {
			...obj,
			parent: deserializeNode(obj.parent),
			node: deserializeNode(obj.node),
			blockedBy: deserializeNode(obj.blockedBy),
		}
	},
})

// ArrayBuffer transfer handler - serializes ArrayBuffer since we can't transfer
Comlink.transferHandlers.set('ArrayBuffer', {
	canHandle: (obj: unknown): obj is ArrayBuffer => obj instanceof ArrayBuffer,
	serialize: (arrayBuffer: ArrayBuffer) => {
		// Convert ArrayBuffer to regular array for serialization
		const uint8Array = new Uint8Array(arrayBuffer)
		const data = Array.from(uint8Array)
		return [
			{
				byteLength: arrayBuffer.byteLength,
				data: data,
			},
			[], // No transferables since we're serializing
		]
	},
	deserialize: (obj: { byteLength: number; data: number[] }) => {
		// Reconstruct ArrayBuffer from serialized data
		const arrayBuffer = new ArrayBuffer(obj.byteLength)
		const uint8Array = new Uint8Array(arrayBuffer)
		uint8Array.set(obj.data)
		return arrayBuffer
	},
})

// TypedArray transfer handler - handles all typed array views
Comlink.transferHandlers.set('TypedArray', {
	canHandle: (obj: unknown): obj is ArrayBufferView => {
		return ArrayBuffer.isView(obj) && !(obj instanceof DataView)
	},
	serialize: (typedArray: ArrayBufferView) => {
		const constructor = typedArray.constructor as any
		const constructorName = constructor.name
		
		// Handle BigInt arrays specially
		const isBigIntArray = constructorName === 'BigInt64Array' || constructorName === 'BigUint64Array'
		
		let data: (number | string)[]
		if (isBigIntArray) {
			// Convert BigInt values to strings for serialization
			const bigIntArray = typedArray as BigInt64Array | BigUint64Array
			data = Array.from(bigIntArray).map((val: bigint) => val.toString())
		} else {
			// Regular numeric arrays
			data = Array.from(typedArray as any)
		}
		
		return [
			{
				constructorName: constructorName,
				data: data,
				byteOffset: typedArray.byteOffset,
				byteLength: typedArray.byteLength,
				length: (typedArray as any).length,
			},
			[], // No transferables since we're serializing
		]
	},
	deserialize: (obj: {
		constructorName: string
		data: (number | string)[]
		byteOffset: number
		byteLength: number
		length: number
	}) => {
		// Map of constructor names to actual constructors
		const constructors: Record<string, any> = {
			'Uint8Array': Uint8Array,
			'Uint8ClampedArray': Uint8ClampedArray,
			'Uint16Array': Uint16Array,
			'Uint32Array': Uint32Array,
			'Int8Array': Int8Array,
			'Int16Array': Int16Array,
			'Int32Array': Int32Array,
			'Float32Array': Float32Array,
			'Float64Array': Float64Array,
		}
		
		// Add BigInt arrays if available
		if (typeof BigInt64Array !== 'undefined') {
			constructors['BigInt64Array'] = BigInt64Array
		}
		if (typeof BigUint64Array !== 'undefined') {
			constructors['BigUint64Array'] = BigUint64Array
		}
		
		const Constructor = constructors[obj.constructorName]
		if (!Constructor) {
			// Fallback to Uint8Array if constructor not found
			return new Uint8Array(obj.data as number[])
		}
		
		// Handle BigInt arrays
		if (obj.constructorName === 'BigInt64Array' || obj.constructorName === 'BigUint64Array') {
			const bigIntData = (obj.data as string[]).map(str => BigInt(str))
			return new Constructor(bigIntData)
		}
		
		// Regular numeric arrays
		return new Constructor(obj.data as number[])
	},
})

// DataView transfer handler
Comlink.transferHandlers.set('DataView', {
	canHandle: (obj: unknown): obj is DataView => obj instanceof DataView,
	serialize: (dataView: DataView) => {
		// Serialize the underlying ArrayBuffer and DataView properties
		const buffer = dataView.buffer
		const uint8Array = new Uint8Array(buffer)
		const bufferData = Array.from(uint8Array)
		
		return [
			{
				bufferData: bufferData,
				byteOffset: dataView.byteOffset,
				byteLength: dataView.byteLength,
			},
			[], // No transferables since we're serializing
		]
	},
	deserialize: (obj: {
		bufferData: number[]
		byteOffset: number
		byteLength: number
	}) => {
		// Reconstruct the ArrayBuffer and create DataView
		const arrayBuffer = new ArrayBuffer(obj.bufferData.length)
		const uint8Array = new Uint8Array(arrayBuffer)
		uint8Array.set(obj.bufferData)
		
		return new DataView(arrayBuffer, obj.byteOffset, obj.byteLength)
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
