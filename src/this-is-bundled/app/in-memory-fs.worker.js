import { InMemoryFileSystem } from './in-memory-fs.js'
import * as Comlink from './comlink-sync.ts'

const fs = new InMemoryFileSystem()

self.onmessage = (event) => {
	const { cmd, port } = event.data || {}
	if (cmd === 'attach' && port) {
		Comlink.expose(fs, port)
	}
}

self.postMessage('ready')
