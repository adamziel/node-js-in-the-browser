import { InMemoryFileSystem } from '/src/this-is-imported-directly/in-memory-fs.js';
import { serializeValue, deserializeValue } from '/src/this-is-imported-directly/serialization.js';
const encoder = new TextEncoder();
const fs = new InMemoryFileSystem();
const handles = new Map();
const handleIds = new WeakMap();
let nextHandleId = 1;
const ERR_BUFFER_TOO_SMALL = -2;
function ok(ctrl, aux = 0) {
    Atomics.store(ctrl, 1, 0);
    Atomics.store(ctrl, 2, aux);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
}
function fail(ctrl, code = -1, err, aux = 0) {
    if (err)
        console.error('[in-memory-fs] operation failed', err);
    Atomics.store(ctrl, 1, code);
    Atomics.store(ctrl, 2, aux);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0);
}
function hasFunctionProperty(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const proto = Object.getPrototypeOf(obj);
    if (!proto)
        return false;
    for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor')
            continue;
        if (typeof obj[key] === 'function')
            return true;
    }
    return false;
}
function gatherMethods(obj) {
    const sync = [];
    const async = [];
    const proto = Object.getPrototypeOf(obj);
    if (!proto)
        return { sync, async };
    for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor')
            continue;
        const value = obj[key];
        if (typeof value !== 'function')
            continue;
        if (key.endsWith('Sync'))
            sync.push(key);
        else
            async.push(key);
    }
    return { sync, async };
}
function registerHandle(obj) {
    var _a;
    if (!hasFunctionProperty(obj))
        return null;
    let id = handleIds.get(obj);
    if (!id) {
        id = nextHandleId++;
        handleIds.set(obj, id);
        handles.set(id, obj);
    }
    const kind = ((_a = obj.constructor) === null || _a === void 0 ? void 0 : _a.name) || 'Object';
    const { sync, async } = gatherMethods(obj);
    return { __type: 'Handle', id, kind, sync, async };
}
function serializeResult(value) {
    return serializeValue(value, {
        handle: registerHandle,
    });
}
function encodeResult(result, ctrl, buffer, mutations) {
    if (!buffer) {
        fail(ctrl, ERR_BUFFER_TOO_SMALL, undefined, 0);
        return;
    }
    const payload = {
        result: serializeResult(result),
        mutations,
    };
    const json = JSON.stringify(payload);
    const bytes = encoder.encode(json);
    if (bytes.length > buffer.byteLength) {
        fail(ctrl, ERR_BUFFER_TOO_SMALL, undefined, bytes.length);
        return;
    }
    new Uint8Array(buffer).set(bytes.subarray(0, buffer.byteLength));
    ok(ctrl, bytes.length);
}
function decodeArgs(args) {
    return args.map((arg) => deserializeValue(arg, {
        handle: (descriptor) => handles.get(descriptor.id),
    }));
}
function invokeFs(method, args) {
    const fn = fs[method];
    if (typeof fn !== 'function') {
        throw new Error(`Unknown filesystem method: ${method}`);
    }
    return fn.apply(fs, args);
}
function invokeHandle(id, method, args) {
    const handle = handles.get(id);
    if (!handle)
        throw new Error(`Unknown handle id ${id}`);
    const fn = handle[method];
    if (typeof fn !== 'function') {
        throw new Error(`Unknown handle method: ${method}`);
    }
    const result = fn.apply(handle, args);
    if (method === 'close' || method === 'closeSync') {
        handles.delete(id);
    }
    return result;
}
function getValueAtPath(args, path) {
    let current = args;
    for (let i = 0; i < path.length; i += 1) {
        const key = path[i];
        current = current === null || current === void 0 ? void 0 : current[key];
        if (current === undefined || current === null)
            break;
    }
    return current;
}
function gatherMutations(args, paths) {
    if (!paths || paths.length === 0)
        return [];
    const mutations = [];
    for (const path of paths) {
        const value = getValueAtPath(args, path);
        if (value === undefined)
            continue;
        mutations.push({ path, value: serializeValue(value, { handle: registerHandle }) });
    }
    return mutations;
}
function processSyncMessage(port, msg) {
    const { target = 'fs', method, args = [], ctrl, buffer, bufferPaths = [] } = msg;
    const ctrlView = new Int32Array(ctrl);
    try {
        const realArgs = decodeArgs(args);
        const outcome = target === 'fs' ? invokeFs(method, realArgs) : invokeHandle(msg.handleId, method, realArgs);
        const mutations = gatherMutations(realArgs, bufferPaths);
        encodeResult(outcome, ctrlView, buffer, mutations);
    }
    catch (err) {
        fail(ctrlView, -1, err);
    }
}
async function processAsyncMessage(port, msg) {
    const { target = 'fs', method, args = [], seq, bufferPaths = [] } = msg;
    if (typeof seq !== 'number')
        return;
    try {
        const realArgs = decodeArgs(args);
        const outcome = target === 'fs' ? invokeFs(method, realArgs) : invokeHandle(msg.handleId, method, realArgs);
        const value = outcome instanceof Promise ? await outcome : outcome;
        const mutations = gatherMutations(realArgs, bufferPaths);
        port.postMessage({
            type: 'async-result',
            seq,
            ok: true,
            result: serializeResult(value),
            mutations,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        port.postMessage({ type: 'async-result', seq, ok: false, message });
    }
}
function sendCatalog(port) {
    const proto = Object.getPrototypeOf(fs);
    const methodNames = Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor');
    const sync = methodNames.filter((name) => name.endsWith('Sync'));
    const async = methodNames.filter((name) => !name.endsWith('Sync'));
    port.postMessage({ type: 'method-catalog', sync, async });
}
function handlePort(port) {
    port.onmessage = (event) => {
        const data = event.data || {};
        if ((data === null || data === void 0 ? void 0 : data.type) === 'get-method-catalog') {
            sendCatalog(port);
            return;
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === 'async-call') {
            processAsyncMessage(port, data);
            return;
        }
        if ((data === null || data === void 0 ? void 0 : data.ctrl) instanceof SharedArrayBuffer) {
            processSyncMessage(port, data);
            return;
        }
    };
    port.start();
}
self.onmessage = (event) => {
    const { cmd, port } = event.data || {};
    if (cmd === 'attach' && port)
        handlePort(port);
};

self.postMessage('ready')