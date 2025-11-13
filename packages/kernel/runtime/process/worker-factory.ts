import { getWorkerConfig } from '../worker-config.ts'
import { createModuleWorker } from '../worker-proxy.ts'

export const createProcessWorker = () => {
	const config = getWorkerConfig()
	return createModuleWorker(config.processController, {
		name: 'kernel-process-controller',
	})
}
