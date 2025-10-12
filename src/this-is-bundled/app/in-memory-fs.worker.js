import { InMemoryFileSystem } from './in-memory-fs.js'
import * as Comlink from './comlink-sync.ts'

const fs = new InMemoryFileSystem()
const methodCatalog = collectMethodCatalog(fs)
const syncMethods = createMethodMap(methodCatalog.sync)
const asyncMethods = createMethodMap(methodCatalog.async)
const syncTransportPromise = Comlink.createSyncTransport()

function collectMethodCatalog(instance) {
        const proto = Object.getPrototypeOf(instance)
        if (!proto) {
                return { sync: [], async: [] }
        }
        const names = Object.getOwnPropertyNames(proto).filter(
                (name) => name !== 'constructor'
        )
        const sync = names.filter((name) => name.endsWith('Sync'))
        const async = names.filter((name) => !name.endsWith('Sync'))
        return { sync, async }
}

function createMethodMap(names) {
        const map = {}
        for (const name of names) {
                const fn = fs[name]
                if (typeof fn !== 'function') {
                        continue
                }
                map[name] = (...args) => wrapValue(fn.apply(fs, args))
        }
        return map
}

function wrapValue(value) {
        if (value && typeof value.then === 'function') {
                return value
        }
        if (Array.isArray(value)) {
                return value.map((entry) => wrapValue(entry))
        }
        if (!value || typeof value !== 'object') {
                return value
        }
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
                return value
        }
        if (value instanceof Date || value instanceof RegExp) {
                return value
        }
        const proto = Object.getPrototypeOf(value)
        if (!proto) {
                return value
        }
        const hasMethods = Object.getOwnPropertyNames(proto).some((key) => {
                if (key === 'constructor') {
                        return false
                }
                return typeof value[key] === 'function'
        })
        return hasMethods ? Comlink.proxy(value) : value
}

async function createSyncEndpoint() {
        const transport = await syncTransportPromise
        const { port1, port2 } = new MessageChannel()
        const endpoint = toEndpoint(port1)
        Comlink.exposeSync(syncMethods, endpoint, transport)
        return Comlink.transfer(port2, [port2])
}

function createAsyncApi() {
        return {
                ...asyncMethods,
                getMethodCatalog: () => methodCatalog,
                getSyncEndpoint: () => createSyncEndpoint(),
        }
}

function toEndpoint(port) {
        if (typeof port?.addEventListener === 'function') {
                return port
        }
        return Comlink.nodeEndpoint(port)
}

function handlePort(port) {
        const api = createAsyncApi()
        const endpoint = toEndpoint(port)
        Comlink.expose(api, endpoint)
        if (typeof port.start === 'function') {
                port.start()
        }
}

self.onmessage = (event) => {
        const { cmd, port } = event.data || {}
        if (cmd === 'attach' && port) {
                handlePort(port)
        }
}

self.postMessage('ready')
