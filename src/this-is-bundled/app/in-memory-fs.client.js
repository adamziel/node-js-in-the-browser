import * as Comlink from './comlink-sync.ts'

function createFilesystemPort(fsWorker) {
	const channel = new MessageChannel()
	fsWorker.postMessage({ cmd: 'attach', port: channel.port1 }, [
		channel.port1,
	])
	return channel.port2
}

export class RemoteInMemoryFileSystem {
	static async connectSync(fsWorker) {
		return await Comlink.wrapSync(createFilesystemPort(fsWorker))
    }
    
	static async connectAsync(fsWorker) {
		return await Comlink.wrap(createFilesystemPort(fsWorker))
	}

	static async connectBoth(fsWorker) {
		return {
			sync: await this.connectSync(fsWorker),
			async: await this.connectAsync(fsWorker),
		}
	}
}
