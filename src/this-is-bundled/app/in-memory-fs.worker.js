import { InMemoryFileSystem } from './in-memory-fs.js'
import { expose } from './api.ts'

const fs = new InMemoryFileSystem()

self.onmessage = (event) => {
	const { cmd, port } = event.data || {}
	if (cmd === 'attach' && port) {
		expose(fs, port)
	}
}

self.postMessage('ready')
