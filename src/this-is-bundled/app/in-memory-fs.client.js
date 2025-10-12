import * as Comlink from './comlink-sync.ts'

function toEndpoint(port) {
        if (typeof port?.addEventListener === 'function') {
                return port
        }
        return Comlink.nodeEndpoint(port)
}

export class RemoteInMemoryFileSystem {
        constructor(syncProxy, asyncProxy, catalog) {
                this.syncProxy = syncProxy
                this.asyncProxy = asyncProxy
                this.methodCatalog = catalog
                this.installMethods()
        }

        static async connect(port) {
                if (typeof port?.start === 'function') {
                        port.start()
                }
                const asyncEndpoint = toEndpoint(port)
                const asyncProxy = Comlink.wrap(asyncEndpoint)
                const catalog = await asyncProxy.getMethodCatalog()
		const syncPort = await asyncProxy.getSyncEndpoint()
		if (typeof syncPort?.start === 'function') {
			syncPort.start()
		}
		const syncEndpoint = toEndpoint(syncPort)
		const syncProxy = await Comlink.wrapSync(syncEndpoint)
                return new RemoteInMemoryFileSystem(syncProxy, asyncProxy, catalog)
        }

        installMethods() {
                for (const method of this.methodCatalog.sync) {
                        if (this[method]) {
                                continue
                        }
                        Object.defineProperty(this, method, {
                                configurable: true,
                                enumerable: false,
                                value: (...args) => this.syncProxy[method](...args),
                        })
                }
                for (const method of this.methodCatalog.async) {
                        if (method === 'getMethodCatalog' || method === 'getSyncEndpoint') {
                                continue
                        }
                        if (this[method]) {
                                continue
                        }
                        Object.defineProperty(this, method, {
                                configurable: true,
                                enumerable: false,
                                value: (...args) => this.asyncProxy[method](...args),
                        })
                }
                this.installOverrides()
        }

        installOverrides() {
                Object.defineProperty(this, 'read', {
                        configurable: true,
                        enumerable: false,
                        value: (...rawArgs) => {
                                const args = [...rawArgs]
                                const maybeCallback = args[args.length - 1]
                                const hasCallback = typeof maybeCallback === 'function'
                                const callback = hasCallback ? (args.pop(), maybeCallback) : undefined
                                try {
                                        const bytesRead = this.readSync(...args)
                                        if (callback) {
                                                this.schedule(() => callback(null, bytesRead, args[1]))
                                        }
                                        return bytesRead
                                } catch (err) {
                                        if (callback) {
                                                this.schedule(() => callback(err))
                                        }
                                        throw err
                                }
                        },
                })

                Object.defineProperty(this, 'writeBuffer', {
                        configurable: true,
                        enumerable: false,
                        value: (fd, buffer, offset, length, position, reqOrPromise) => {
                                if (
                                        reqOrPromise &&
                                        typeof reqOrPromise === 'object' &&
                                        typeof reqOrPromise.oncomplete === 'function'
                                ) {
                                        const req = reqOrPromise
                                        this.schedule(() => {
                                                try {
                                                        const bytesWritten = this.writeBufferSync(
                                                                fd,
                                                                buffer,
                                                                offset,
                                                                length,
                                                                position
                                                        )
                                                        req.oncomplete(null, bytesWritten, buffer)
                                                } catch (err) {
                                                        req.oncomplete(err)
                                                }
                                        })
                                        return
                                }
                                if (reqOrPromise !== undefined) {
                                        return Promise.resolve(
                                                this.writeBufferSync(fd, buffer, offset, length, position)
                                        )
                                }
                                return this.writeBufferSync(fd, buffer, offset, length, position)
                        },
                })

                Object.defineProperty(this, 'exists', {
                        configurable: true,
                        enumerable: false,
                        value: (path, callback) => {
                                if (typeof callback === 'function') {
                                        const exists = Boolean(this.existsSync(path))
                                        this.schedule(() => callback(exists))
                                        return
                                }
                                if (typeof this.asyncProxy.exists === 'function') {
                                        return this.asyncProxy.exists(path)
                                }
                                return Promise.resolve(this.existsSync(path))
                        },
                })

                Object.defineProperty(this, 'readAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (fd, buffer, offset, length, position, req) => {
                                this.schedule(() => {
                                        try {
                                                const bytesRead = this.readSync(
                                                        fd,
                                                        buffer,
                                                        offset,
                                                        length,
                                                        position
                                                )
                                                req?.oncomplete?.call(req, null, bytesRead, buffer)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })

                Object.defineProperty(this, 'writeAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (fd, buffer, offset, length, position, req) => {
                                this.schedule(() => {
                                        try {
                                                const bytesWritten = this.writeSync(
                                                        fd,
                                                        buffer,
                                                        offset,
                                                        length,
                                                        position
                                                )
                                                req?.oncomplete?.call(req, null, bytesWritten)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })

                for (const method of ['statAsync', 'fstatAsync', 'lstatAsync']) {
                        Object.defineProperty(this, method, {
                                configurable: true,
                                enumerable: false,
                                value: (...args) => {
                                        const req = args[args.length - 1]
                                        const callArgs = args.slice(0, -1)
                                        const syncMethod = method.replace('Async', 'Sync')
                                        this.schedule(() => {
                                                try {
                                                        const result = this[syncMethod](...callArgs)
                                                        req?.oncomplete?.call(req, null, result)
                                                } catch (err) {
                                                        req?.oncomplete?.call(req, err)
                                                }
                                        })
                                },
                        })
                }

                Object.defineProperty(this, 'mkdirAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (path, options, req) => {
                                this.schedule(() => {
                                        try {
                                                this.mkdirSync(path, options)
                                                req?.oncomplete?.call(req, null)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })

                Object.defineProperty(this, 'unlinkAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (path, req) => {
                                this.schedule(() => {
                                        try {
                                                this.unlinkSync(path)
                                                req?.oncomplete?.call(req, null)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })

                Object.defineProperty(this, 'rmdirAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (path, options, req) => {
                                this.schedule(() => {
                                        try {
                                                this.rmdirSync(path, options)
                                                req?.oncomplete?.call(req, null)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })

                Object.defineProperty(this, 'renameAsync', {
                        configurable: true,
                        enumerable: false,
                        value: (oldPath, newPath, req) => {
                                this.schedule(() => {
                                        try {
                                                this.renameSync(oldPath, newPath)
                                                req?.oncomplete?.call(req, null)
                                        } catch (err) {
                                                req?.oncomplete?.call(req, err)
                                        }
                                })
                        },
                })
        }

        schedule(fn) {
                if (typeof queueMicrotask === 'function') {
                        queueMicrotask(fn)
                } else {
                        setTimeout(fn, 0)
                }
        }
}

export async function connectInMemoryFS(port) {
        return RemoteInMemoryFileSystem.connect(port)
}
