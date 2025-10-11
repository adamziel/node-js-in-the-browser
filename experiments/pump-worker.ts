import { STATE_FULL, FLAG_MORE } from './constants'
console.log('[PUMP] booted')
self.onmessage = function (e) {
	const data = e.data
	console.log('[PUMP GLOBAL] received message', data)
	if (!data || data.type !== 'init') return
	const control = new Int32Array(data.ctrl)
	const payload = new Uint8Array(data.buf)
	const port = data.port
	const te = new TextEncoder()

	function waitUntilEmptyOrClosed() {
		for (;;) {
			const st = Atomics.load(control, 0)
			if (st === 0 || st < 0) return st
			Atomics.wait(control, 0, st) // wait for consumer to flip it
		}
	}

	port.onmessage = (ev) => {
		console.log("[PUMP PORT] port message received", ev.data);
		const json = JSON.stringify(ev.data)
		const bytes = te.encode(json)

		// Stream in chunks that fit the shared payload
		let i = 0
		while (i < bytes.length) {
			const st = waitUntilEmptyOrClosed()
			if (st < 0) return

			const n = Math.min(payload.byteLength, bytes.length - i)
			payload.set(bytes.subarray(i, i + n))
			Atomics.store(control, 1, n)
			Atomics.store(control, 2, i + n < bytes.length ? FLAG_MORE : 0)
			Atomics.store(control, 0, STATE_FULL)
			Atomics.notify(control, 0, 1)
			i += n
		}
	}

	port.start()
	self.postMessage({ type: 'ready' })
}

self.postMessage({ type: 'ready' })
