import { serializeValue, deserializeValue } from './serialization.js';
const ERR_BUFFER_TOO_SMALL = -2;
const decoder = new TextDecoder();
function pathKey(path) {
    return JSON.stringify(path);
}
function wait(ctrl) {
    const i32 = new Int32Array(ctrl);
    while (Atomics.load(i32, 0) === 0) {
        Atomics.wait(i32, 0, 0);
    }
    return {
        code: Atomics.load(i32, 1),
        aux: Atomics.load(i32, 2),
    };
}
function cloneBytes(view) {
    const copy = new Uint8Array(view.length);
    copy.set(view);
    return copy;
}
function collectTypedArrayRefs(value, path, out, seen) {
    if (value === null || value === undefined)
        return;
    if (ArrayBuffer.isView(value)) {
        out.push({ path: [...path], ref: value });
        return;
    }
    if (value instanceof ArrayBuffer) {
        return;
    }
    if (typeof value !== 'object')
        return;
    if (seen.has(value))
        return;
    seen.add(value);
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            collectTypedArrayRefs(value[index], [...path, index], out, seen);
        }
        return;
    }
    for (const key of Object.keys(value)) {
        const child = value[key];
        if (typeof child === 'function')
            continue;
        collectTypedArrayRefs(child, [...path, key], out, seen);
    }
}
function copyInto(target, source) {
    const targetView = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    let sourceView;
    if (ArrayBuffer.isView(source)) {
        sourceView = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
    else if (source instanceof ArrayBuffer) {
        sourceView = new Uint8Array(source);
    }
    else if (Array.isArray(source)) {
        sourceView = Uint8Array.from(source);
    }
    targetView.set(sourceView.subarray(0, targetView.length));
}
export class RemoteInMemoryFileSystem {
    constructor(port, catalog) {
        this.pending = new Map();
        this.nextSeq = 1;
        this.handleCache = new Map();
        this.onMessage = (event) => {
            var _a, _b;
            const data = event.data || {};
            if ((data === null || data === void 0 ? void 0 : data.type) === 'async-result') {
                const entry = this.pending.get(data.seq);
                if (!entry)
                    return;
                this.pending.delete(data.seq);
                if (data.ok) {
                    try {
                        this.applyMutations(data.mutations, entry.buffers);
                        const value = this.deserialize(data.result);
                        if (((_a = entry.meta) === null || _a === void 0 ? void 0 : _a.target) === 'handle' && entry.meta.method === 'close' && entry.meta.handleId !== undefined) {
                            this.handleCache.delete(entry.meta.handleId);
                        }
                        entry.resolve(value);
                    }
                    catch (err) {
                        entry.reject(err);
                    }
                }
                else {
                    entry.reject(new Error((_b = data.message) !== null && _b !== void 0 ? _b : 'Unknown error'));
                }
            }
        };
        this.port = port;
        this.methodCatalog = catalog;
        this.port.addEventListener('message', this.onMessage);
        this.port.start();
        this.installMethods();
    }
    static async connect(port) {
        const catalog = await requestCatalog(port);
        return new RemoteInMemoryFileSystem(port, catalog);
    }
    installMethods() {
        for (const method of this.methodCatalog.sync) {
            if (this[method])
                continue;
            Object.defineProperty(this, method, {
                configurable: true,
                enumerable: false,
                value: (...args) => this.callSync('fs', method, args),
            });
        }
        for (const method of this.methodCatalog.async) {
            if (this[method])
                continue;
            Object.defineProperty(this, method, {
                configurable: true,
                enumerable: false,
                value: (...args) => this.callAsync('fs', method, args),
            });
        }
        this.installOverrides();
    }
    installOverrides() {
        Object.defineProperty(this, 'read', {
            configurable: true,
            enumerable: false,
            value: (...rawArgs) => {
                const args = [...rawArgs];
                const maybeCallback = args[args.length - 1];
                const hasCallback = typeof maybeCallback === 'function';
                const callback = hasCallback ? (args.pop(), maybeCallback) : undefined;
                try {
                    const bytesRead = this.callSync('fs', 'readSync', args);
                    if (callback) {
                        this.schedule(() => callback(null, bytesRead, args[1]));
                    }
                    return bytesRead;
                }
                catch (err) {
                    if (callback) {
                        this.schedule(() => callback(err));
                    }
                    throw err;
                }
            },
        });
        Object.defineProperty(this, 'writeBuffer', {
            configurable: true,
            enumerable: false,
            value: (fd, buffer, offset, length, position, reqOrPromise) => {
                if (reqOrPromise && typeof reqOrPromise === 'object' && typeof reqOrPromise.oncomplete === 'function') {
                    const req = reqOrPromise;
                    this.schedule(() => {
                        try {
                            const bytesWritten = this.writeBufferSync(fd, buffer, offset, length, position);
                            req.oncomplete(null, bytesWritten, buffer);
                        }
                        catch (err) {
                            req.oncomplete(err);
                        }
                    });
                    return;
                }
                if (reqOrPromise !== undefined) {
                    return Promise.resolve(this.writeBufferSync(fd, buffer, offset, length, position));
                }
                return this.writeBufferSync(fd, buffer, offset, length, position);
            },
        });
        Object.defineProperty(this, 'exists', {
            configurable: true,
            enumerable: false,
            value: (path, callback) => {
                if (typeof callback === 'function') {
                    const exists = Boolean(this.existsSync(path));
                    this.schedule(() => callback(exists));
                    return;
                }
                return this.callAsync('fs', 'exists', [path]);
            },
        });
        Object.defineProperty(this, 'readAsync', {
            configurable: true,
            enumerable: false,
            value: (fd, buffer, offset, length, position, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        const bytesRead = this.readSync(fd, buffer, offset, length, position);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null, bytesRead, buffer);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
        Object.defineProperty(this, 'writeAsync', {
            configurable: true,
            enumerable: false,
            value: (fd, buffer, offset, length, position, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        const bytesWritten = this.writeSync(fd, buffer, offset, length, position);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null, bytesWritten);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
        for (const method of ['statAsync', 'fstatAsync', 'lstatAsync']) {
            Object.defineProperty(this, method, {
                configurable: true,
                enumerable: false,
                value: (...args) => {
                    const req = args[args.length - 1];
                    const callArgs = args.slice(0, -1);
                    const syncMethod = method.replace('Async', 'Sync');
                    this.schedule(() => {
                        var _a, _b;
                        try {
                            const result = this[syncMethod](...callArgs);
                            (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null, result);
                        }
                        catch (err) {
                            (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                        }
                    });
                },
            });
        }
        Object.defineProperty(this, 'mkdirAsync', {
            configurable: true,
            enumerable: false,
            value: (path, options, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        this.mkdirSync(path, options);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
        Object.defineProperty(this, 'unlinkAsync', {
            configurable: true,
            enumerable: false,
            value: (path, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        this.unlinkSync(path);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
        Object.defineProperty(this, 'rmdirAsync', {
            configurable: true,
            enumerable: false,
            value: (path, options, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        this.rmdirSync(path, options);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
        Object.defineProperty(this, 'renameAsync', {
            configurable: true,
            enumerable: false,
            value: (oldPath, newPath, req) => {
                this.schedule(() => {
                    var _a, _b;
                    try {
                        this.renameSync(oldPath, newPath);
                        (_a = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _a === void 0 ? void 0 : _a.call(req, null);
                    }
                    catch (err) {
                        (_b = req === null || req === void 0 ? void 0 : req.oncomplete) === null || _b === void 0 ? void 0 : _b.call(req, err);
                    }
                });
            },
        });
    }
    schedule(fn) {
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(fn);
        }
        else {
            setTimeout(fn, 0);
        }
    }
    prepareArgs(args) {
        const refs = [];
        const seen = new WeakSet();
        args.forEach((arg, index) => collectTypedArrayRefs(arg, [index], refs, seen));
        const buffers = new Map();
        for (const ref of refs) {
            buffers.set(pathKey(ref.path), ref);
        }
        return {
            serialized: args.map((arg) => serializeValue(arg)),
            bufferPaths: refs.map((ref) => ref.path),
            buffers,
        };
    }
    applyMutations(mutations, buffers) {
        if (!mutations || mutations.length === 0 || !buffers)
            return;
        for (const mutation of mutations) {
            const key = pathKey(mutation.path);
            const ref = buffers.get(key);
            if (!ref)
                continue;
            const value = this.deserialize(mutation.value);
            if (ArrayBuffer.isView(value)) {
                copyInto(ref.ref, value);
            }
            else if (value instanceof ArrayBuffer) {
                copyInto(ref.ref, value);
            }
            else if (Array.isArray(value)) {
                copyInto(ref.ref, Uint8Array.from(value));
            }
        }
    }
    deserialize(value) {
        return deserializeValue(value, {
            handle: (descriptor) => this.getHandleProxy(descriptor),
        });
    }
    getHandleProxy(descriptor) {
        const cached = this.handleCache.get(descriptor.id);
        if (cached)
            return cached;
        const proxy = {
            __handleId: descriptor.id,
            __handleKind: descriptor.kind,
        };
        for (const method of descriptor.sync) {
            Object.defineProperty(proxy, method, {
                configurable: true,
                enumerable: false,
                value: (...args) => this.callSync('handle', method, args, descriptor.id),
            });
        }
        for (const method of descriptor.async) {
            Object.defineProperty(proxy, method, {
                configurable: true,
                enumerable: false,
                value: (...args) => {
                    const promise = this.callAsync('handle', method, args, descriptor.id);
                    if (method === 'close') {
                        return promise.then((result) => {
                            this.handleCache.delete(descriptor.id);
                            return result;
                        });
                    }
                    return promise;
                },
            });
        }
        this.handleCache.set(descriptor.id, proxy);
        return proxy;
    }
    callSync(target, method, args, handleId) {
        let bufferSize = 64 * 1024;
        const context = this.prepareArgs(args);
        while (true) {
            const ctrl = new SharedArrayBuffer(12);
            const buffer = new SharedArrayBuffer(bufferSize);
            const message = {
                target,
                method,
                args: context.serialized,
                bufferPaths: context.bufferPaths,
                ctrl,
                buffer,
            };
            if (handleId !== undefined)
                message.handleId = handleId;
            this.port.postMessage(message);
            const { code, aux } = wait(ctrl);
            if (code === 0) {
                const sharedBytes = new Uint8Array(buffer, 0, aux);
                const bytes = cloneBytes(sharedBytes);
                const json = decoder.decode(bytes);
                const payload = json.length ? JSON.parse(json) : undefined;
                const resultValue = payload ? this.deserialize(payload.result) : undefined;
                this.applyMutations(payload === null || payload === void 0 ? void 0 : payload.mutations, context.buffers);
                if (target === 'handle' && handleId !== undefined && (method === 'close' || method === 'closeSync')) {
                    this.handleCache.delete(handleId);
                }
                return resultValue;
            }
            if (code === ERR_BUFFER_TOO_SMALL) {
                bufferSize = Math.max(bufferSize * 2, aux || bufferSize * 2);
                continue;
            }
            throw new Error(`FS error (${code})`);
        }
    }
    callAsync(target, method, args, handleId) {
        const seq = this.nextSeq++;
        const context = this.prepareArgs(args);
        return new Promise((resolve, reject) => {
            this.pending.set(seq, {
                resolve,
                reject,
                buffers: context.buffers,
                meta: { target, method, handleId },
            });
            const message = {
                type: 'async-call',
                target,
                method,
                args: context.serialized,
                bufferPaths: context.bufferPaths,
                seq,
            };
            if (handleId !== undefined)
                message.handleId = handleId;
            this.port.postMessage(message);
        });
    }
}
async function requestCatalog(port) {
    return new Promise((resolve, reject) => {
        const listener = (event) => {
            var _a, _b;
            const data = event.data || {};
            if ((data === null || data === void 0 ? void 0 : data.type) === 'method-catalog') {
                port.removeEventListener('message', listener);
                clearTimeout(timeout);
                resolve({ sync: (_a = data.sync) !== null && _a !== void 0 ? _a : [], async: (_b = data.async) !== null && _b !== void 0 ? _b : [] });
            }
        };
        port.addEventListener('message', listener);
        port.start();
        port.postMessage({ type: 'get-method-catalog' });
        const timeoutError = new Error('Timed out waiting for method catalog');
        const timeout = setTimeout(() => {
            port.removeEventListener('message', listener);
            reject(timeoutError);
        }, 5000);
    });
}
export async function connectInMemoryFS(port) {
    return RemoteInMemoryFileSystem.connect(port);
}
