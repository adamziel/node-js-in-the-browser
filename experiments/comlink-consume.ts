import { wrapSync, createSyncTransport } from './comlink-sync'

const worker = new Worker(new URL('./comlink-expose.ts', import.meta.url), {
	type: 'module',
	name: 'sync-worker',
	credentials: 'include',
})

const api = await wrapSync(worker, await createSyncTransport())
console.log('Api wrapped')

console.log('before call')
console.log(api.getRandomUUID())
console.log('after call')
console.log('another uuid', api.getRandomUUID())
console.log('and another another', api.getRandomUUID())
