import { exposeSync, NodeSABSyncReceiveMessageTransport } from './comlink-sync'

exposeSync(
	{
		async getRandomUUID() {
			await new Promise(resolve => setTimeout(resolve, 300))
			return crypto.randomUUID()
		},
	},
	self,
	NodeSABSyncReceiveMessageTransport.create()
)
