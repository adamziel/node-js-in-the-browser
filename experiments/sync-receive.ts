// sync-receive.ts
// Synchronous receive for MessagePort in browsers using SAB + Atomics.wait.
// Works only in Workers and cross-origin-isolated contexts.
// This takes ownership of the port (it’s transferred to an internal pump worker).
import { STATE_EMPTY, STATE_FULL, STATE_CLOSED, FLAG_MORE } from './constants'
type SyncConnectionState = {
	worker: Worker
	control: Int32Array // [state, len, reserved]
	payload: Uint8Array // shared payload buffer
	ctrlSAB: SharedArrayBuffer
	bufSAB: SharedArrayBuffer
}
const states = new WeakMap<MessagePort, SyncConnectionState>()
const td = new TextDecoder()

async function spawnPumpWorker(): Promise<Worker> {
	return await new Promise<Worker>((resolve, reject) => {
		const worker = new Worker(new URL('./pump-worker.ts', import.meta.url), {
			type: 'module',
			credentials: 'include',
			name: 'pump-worker',
		})
		worker.onmessage = (e) => {
			console.log('[sync-receive.ts] pump worker message', e.data)
			resolve(worker)
		}
		worker.onerror = (e) => {
			console.log('[sync-receive.ts] pump worker error', e)
			reject(e)
		}
	})
}

async function connectToWorker(
	worker: Worker,
	port: MessagePort,
	bufferBytes: number = 1 << 20 /* 1 MiB */
): Promise<SyncConnectionState> {
	const existing = states.get(port)
	if (existing) return existing

	const ctrlSAB = new SharedArrayBuffer(16) // 3 * Int32 (12) + padding
	const bufSAB = new SharedArrayBuffer(bufferBytes)

	const control = new Int32Array(ctrlSAB, 0, 3)
	const payload = new Uint8Array(bufSAB)

	// state=EMPTY, len=0
	Atomics.store(control, 0, STATE_EMPTY)
	Atomics.store(control, 1, 0)

	// Transfer the port to the pump worker; we keep only the handle object as a WeakMap key.
	worker.postMessage({ type: 'init', port, ctrl: ctrlSAB, buf: bufSAB }, [
		port,
	]);
	// Wait for the pump worker to respond
	await new Promise<void>((resolve) => {
		worker.onmessage = () => resolve()
	})
	console.log('[sync-receive.ts] transferred port to pump worker')

	const st: SyncConnectionState = { worker, control, payload, ctrlSAB, bufSAB }
	states.set(port, st)
	return st
}

/**
 * Synchronous receive. Blocks the current worker thread until a message arrives,
 * then returns { message }. Returns undefined if the channel is closed via closeSyncReceive().
 *
 * Options:
 *   - bufferBytes: size of the shared payload buffer (default 1 MiB).
 *   - timeoutMs: optional timeout; if elapsed, returns undefined.
 */
export function receiveMessageOnPort(
	port: MessagePort,
	st: SyncConnectionState,
	options?: { bufferBytes?: number; timeoutMs?: number }
): { message: any } | undefined {
	console.log('[sync-receive.ts] receiveMessageOnPort', { port, st, options })
	const pieces: Uint8Array[] = []
	let total = 0

	for (;;) {
		const cur = Atomics.load(st.control, 0)

		if (cur === STATE_FULL) {
			const len = Atomics.load(st.control, 1)
			const flags = Atomics.load(st.control, 2)
			const chunk = st.payload.slice(0, len)
			pieces.push(chunk)
			total += len

			Atomics.store(st.control, 0, STATE_EMPTY)
			Atomics.notify(st.control, 0, 1)

			if ((flags & FLAG_MORE) === 0) {
				const bytes = new Uint8Array(total)
				let off = 0
				for (const p of pieces) {
					bytes.set(p, off)
					off += p.length
				}
				return { message: JSON.parse(td.decode(bytes)) }
			}

			// Otherwise, loop to wait for the next chunk.
			continue
		}

		if (cur === STATE_CLOSED) return undefined

		// Timeout behavior unchanged; it applies to each wait.
		if (options?.timeoutMs !== undefined) {
			console.log("Calling Atomic.wait();");
			const res = (Atomics as any).wait(
				st.control,
				0,
				cur,
				options.timeoutMs
			)
			console.log("Atomic.wait() returned", {res});
			if (res === 'timed-out') return undefined
		} else {
			console.log("Calling Atomic.wait();");
			const res = Atomics.wait(st.control, 0, cur)
			console.log("Atomic.wait() returned", {res});
		}
	}
}

/**
 * Non-blocking poll, similar to Node’s receiveMessageOnPort().
 * Returns { message } if present, otherwise undefined.
 */
const builders = new WeakMap<
	MessagePort,
	{ chunks: Uint8Array[]; total: number }
>()

export function tryReceiveMessageOnPort(
	port: MessagePort
): { message: any } | undefined {
	const st = states.get(port)
	if (!st) return undefined

	if (Atomics.load(st.control, 0) !== STATE_FULL) return undefined

	const len = Atomics.load(st.control, 1)
	const flags = Atomics.load(st.control, 2)
	const chunk = st.payload.slice(0, len)

	Atomics.store(st.control, 0, STATE_EMPTY)
	Atomics.notify(st.control, 0, 1)

	let b = builders.get(port)
	if (!b) {
		b = { chunks: [], total: 0 }
		builders.set(port, b)
	}
	b.chunks.push(chunk)
	b.total += chunk.length

	if ((flags & FLAG_MORE) !== 0) return undefined

	const bytes = new Uint8Array(b.total)
	let off = 0
	for (const c of b.chunks) {
		bytes.set(c, off)
		off += c.length
	}
	builders.delete(port)

	return { message: JSON.parse(td.decode(bytes)) }
}

/**
 * Gracefully stop the pump and unblock any waiters.
 */
export function closeSyncReceive(port: MessagePort): void {
	const st = states.get(port)
	if (!st) return
	Atomics.store(st.control, 0, STATE_CLOSED)
	Atomics.notify(st.control, 0, 1)
	st.worker.terminate()
	states.delete(port)
}

console.log('[sync-receive.ts] booted')
self.onmessage = async function (e) {
	const { port } = e.data

	console.log('[sync-receive.ts] received message')
	try {
		self.postMessage({ type: 'ready' })

		console.log('[sync-receive.ts] before call to receiveMessageOnPort')
		const worker = await spawnPumpWorker()
		const connectionState = await connectToWorker(worker, port, 1 << 20)
		console.log('[sync-receive.ts] ===> spawned pump worker')

		// Try to receive a message synchronously
		console.log('[sync-receive.ts] ===> before posting message to worker')
		worker.postMessage({ type: 'will this message come across before receiveMessageOnPort?' })
		console.log('[sync-receive.ts] ===> posted message to worker')
		const result = receiveMessageOnPort(port, connectionState, { timeoutMs: 5000 })

		console.log('[sync-receive.ts] after call to receiveMessageOnPort')

		if (result) {
			self.postMessage({
				type: 'received',
				message: result.message,
			})
		} else {
			self.postMessage({
				type: 'timeout',
			})
		}
	} catch (error) {
		self.postMessage({
			type: 'error',
			error: error.message,
		})
	}
}
