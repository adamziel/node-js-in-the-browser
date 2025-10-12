import { wrap, wrapSync } from './api.ts'

function createFilesystemPort(fsWorker) {
	const channel = new MessageChannel()
	fsWorker.postMessage({ cmd: 'attach', port: channel.port1 }, [
		channel.port1,
	])
	return channel.port2
}

export class RemoteInMemoryFileSystem {
	static async connectSync(fsWorkerOrPort) {
        let port: MessagePort;
		if (fsWorkerOrPort instanceof Worker) {
			port = createFilesystemPort(fsWorkerOrPort)
		} else if (fsWorkerOrPort instanceof MessagePort) {
			port = fsWorkerOrPort
		} else {
			throw new Error('Invalid filesystem worker or port')
		}
		return await wrapSync(port)
	}

	static async connectAsync(fsWorker) {
		return await wrap(fsWorker) //createFilesystemPort(fsWorker))
	}

	static async connectBoth(fsWorker) {
		return {
			sync: await this.connectSync(fsWorker),
			async: await this.connectAsync(fsWorker),
		}
	}
}
