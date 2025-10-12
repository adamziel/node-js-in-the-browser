import { wrap, wrapSync } from './api.ts'

function createFilesystemPort(fsWorker) {
	const channel = new MessageChannel()
	fsWorker.postMessage({ cmd: 'attach', port: channel.port1 }, [
		channel.port1,
	])
	return channel.port2
}

export class RemoteInMemoryFileSystem {
	static async connectSync(fsWorker) {
		return await wrapSync(createFilesystemPort(fsWorker))
	}

	static async connectAsync(fsWorker) {
        return await wrap(fsWorker); //createFilesystemPort(fsWorker))
	}

	static async connectBoth(fsWorker) {
		return {
			sync: await this.connectSync(fsWorker),
			async: await this.connectAsync(fsWorker),
		}
	}
}
