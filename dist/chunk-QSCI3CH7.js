import {
  __esm,
  __export
} from "./chunk-IWXS4Z3P.js";

// src/this-is-bundled/node-lib/v8.js
var v8_exports = {};
__export(v8_exports, {
  default: () => v8_default,
  deserialize: () => deserialize,
  getHeapSpaceStatistics: () => getHeapSpaceStatistics,
  getHeapStatistics: () => getHeapStatistics,
  serialize: () => serialize
});
function serialize(value) {
  stableConsole.log({ value });
  const seen = /* @__PURE__ */ new WeakMap();
  let refId = 0;
  function serializeValue(val) {
    if (val === null) return { type: "null" };
    if (val === void 0) return { type: "undefined" };
    const type = typeof val;
    if (type === "boolean" || type === "number" || type === "string") {
      return { type, value: val };
    }
    if (type === "bigint") {
      return { type: "bigint", value: val.toString() };
    }
    if (type === "symbol") {
      return { type: "symbol", value: val.description };
    }
    if (typeof val === "object") {
      if (seen.has(val)) {
        return { type: "ref", id: seen.get(val) };
      }
      const id = refId++;
      seen.set(val, id);
    }
    if (val instanceof Date) {
      return { type: "Date", value: val.toISOString() };
    }
    if (val instanceof RegExp) {
      return { type: "RegExp", source: val.source, flags: val.flags };
    }
    if (val instanceof Error) {
      return {
        type: "Error",
        name: val.name,
        message: val.message,
        stack: val.stack
      };
    }
    if (val instanceof Map) {
      const entries = Array.from(val.entries()).map(([k, v]) => [
        serializeValue(k),
        serializeValue(v)
      ]);
      return { type: "Map", entries };
    }
    if (val instanceof Set) {
      const values = Array.from(val).map((v) => serializeValue(v));
      return { type: "Set", values };
    }
    if (typeof Buffer !== "undefined" && val instanceof Buffer) {
      return {
        type: "Buffer",
        values: Array.from(val)
      };
    }
    if (ArrayBuffer.isView(val) && !(val instanceof DataView)) {
      const typedArray = val;
      return {
        type: typedArray.constructor.name,
        values: Array.from(typedArray)
      };
    }
    if (val instanceof ArrayBuffer) {
      return {
        type: "ArrayBuffer",
        values: Array.from(new Uint8Array(val))
      };
    }
    if (val instanceof DataView) {
      return {
        type: "DataView",
        buffer: Array.from(new Uint8Array(val.buffer)),
        byteOffset: val.byteOffset,
        byteLength: val.byteLength
      };
    }
    if (Array.isArray(val)) {
      return {
        type: "Array",
        values: val.map((v) => serializeValue(v))
      };
    }
    if (val.constructor === Object || val.constructor === void 0) {
      const entries = Object.entries(val).map(([k, v]) => [k, serializeValue(v)]);
      return { type: "Object", entries };
    }
    try {
      const entries = Object.entries(val).map(([k, v]) => [k, serializeValue(v)]);
      return { type: "Object", entries, className: val.constructor?.name };
    } catch (e) {
      throw e;
    }
  }
  const serialized = serializeValue(value);
  const json = JSON.stringify(serialized);
  const encoder = new TextEncoder();
  return encoder.encode(json);
}
function deserialize(buffer) {
  let json;
  if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
    const decoder = new TextDecoder();
    json = decoder.decode(buffer);
  } else if (typeof buffer === "string") {
    json = buffer;
  } else {
    throw new Error("deserialize expects a Uint8Array, ArrayBuffer, or string");
  }
  const serialized = JSON.parse(json);
  const refs = /* @__PURE__ */ new Map();
  function deserializeValue(val) {
    if (!val || typeof val !== "object" || !val.type) {
      return val;
    }
    const { type } = val;
    if (type === "null") return null;
    if (type === "undefined") return void 0;
    if (type === "boolean" || type === "number" || type === "string") {
      return val.value;
    }
    if (type === "bigint") return BigInt(val.value);
    if (type === "symbol") return Symbol(val.value);
    if (type === "ref") {
      return refs.get(val.id);
    }
    if (type === "Date") {
      return new Date(val.value);
    }
    if (type === "RegExp") {
      return new RegExp(val.source, val.flags);
    }
    if (type === "Error") {
      const err = new Error(val.message);
      err.name = val.name;
      err.stack = val.stack;
      return err;
    }
    if (type === "Map") {
      const map = /* @__PURE__ */ new Map();
      for (const [k, v] of val.entries) {
        map.set(deserializeValue(k), deserializeValue(v));
      }
      return map;
    }
    if (type === "Set") {
      const set = /* @__PURE__ */ new Set();
      for (const v of val.values) {
        set.add(deserializeValue(v));
      }
      return set;
    }
    if (type === "Buffer") {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(val.values);
      } else {
        return new Uint8Array(val.values);
      }
    }
    const typedArrayTypes = {
      "Int8Array": Int8Array,
      "Uint8Array": Uint8Array,
      "Uint8ClampedArray": Uint8ClampedArray,
      "Int16Array": Int16Array,
      "Uint16Array": Uint16Array,
      "Int32Array": Int32Array,
      "Uint32Array": Uint32Array,
      "Float32Array": Float32Array,
      "Float64Array": Float64Array,
      "BigInt64Array": BigInt64Array,
      "BigUint64Array": BigUint64Array
    };
    if (typedArrayTypes[type]) {
      return new typedArrayTypes[type](val.values);
    }
    if (type === "ArrayBuffer") {
      return new Uint8Array(val.values).buffer;
    }
    if (type === "DataView") {
      const buffer2 = new Uint8Array(val.buffer).buffer;
      return new DataView(buffer2, val.byteOffset, val.byteLength);
    }
    if (type === "Array") {
      return val.values.map((v) => deserializeValue(v));
    }
    if (type === "Object") {
      const obj = {};
      for (const [k, v] of val.entries) {
        obj[k] = deserializeValue(v);
      }
      return obj;
    }
    return void 0;
  }
  return deserializeValue(serialized);
}
var estimatedHeapStats, getHeapStatistics, getHeapSpaceStatistics, v8_default;
var init_v8 = __esm({
  "src/this-is-bundled/node-lib/v8.js"() {
    estimatedHeapStats = () => {
      var _a, _b, _c, _d, _e, _f, _g;
      const memory = performance === null || performance === void 0 ? void 0 : performance.memory;
      if (memory) {
        return {
          total_heap_size: (_a = memory.totalJSHeapSize) !== null && _a !== void 0 ? _a : 0,
          total_heap_size_executable: (_b = memory.jsHeapSizeLimit) !== null && _b !== void 0 ? _b : 0,
          total_physical_size: (_c = memory.totalJSHeapSize) !== null && _c !== void 0 ? _c : 0,
          total_available_size: Math.max(((_d = memory.jsHeapSizeLimit) !== null && _d !== void 0 ? _d : 0) - ((_e = memory.usedJSHeapSize) !== null && _e !== void 0 ? _e : 0), 0),
          used_heap_size: (_f = memory.usedJSHeapSize) !== null && _f !== void 0 ? _f : 0,
          heap_size_limit: (_g = memory.jsHeapSizeLimit) !== null && _g !== void 0 ? _g : 0,
          malloced_memory: 0,
          peak_malloced_memory: 0,
          does_zap_garbage: 0,
          number_of_native_contexts: 1,
          number_of_detached_contexts: 0
        };
      }
      const limit = 128 * 1024 * 1024;
      return {
        total_heap_size: limit,
        total_heap_size_executable: limit,
        total_physical_size: limit,
        total_available_size: limit,
        used_heap_size: 0,
        heap_size_limit: limit,
        malloced_memory: 0,
        peak_malloced_memory: 0,
        does_zap_garbage: 0,
        number_of_native_contexts: 1,
        number_of_detached_contexts: 0
      };
    };
    getHeapStatistics = () => {
      return estimatedHeapStats();
    };
    getHeapSpaceStatistics = () => [];
    v8_default = {
      getHeapStatistics,
      getHeapSpaceStatistics,
      serialize,
      deserialize
    };
  }
});

export {
  getHeapStatistics,
  getHeapSpaceStatistics,
  serialize,
  deserialize,
  v8_default,
  v8_exports,
  init_v8
};
