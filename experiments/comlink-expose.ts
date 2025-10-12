import { exposeSync, createSyncTransport } from './comlink-sync'

const transport = await createSyncTransport()

exposeSync(
	{
		async getRandomUUID() {
			await new Promise(resolve => setTimeout(resolve, 300))
			return crypto.randomUUID()
		},
	},
	self,
	transport
)
