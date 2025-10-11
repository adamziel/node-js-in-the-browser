const TYPED_ARRAY_CTORS = {
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
};
if (typeof BigInt64Array !== 'undefined') {
  TYPED_ARRAY_CTORS.BigInt64Array = BigInt64Array;
}
if (typeof BigUint64Array !== 'undefined') {
  TYPED_ARRAY_CTORS.BigUint64Array = BigUint64Array;
}
export function serializeValue(value, opts = {}) {
  if (value === undefined)
      return { __type: 'undefined' };
  if (value === null)
      return null;
  const type = typeof value;
  if (type === 'number' || type === 'string' || type === 'boolean')
      return value;
  if (type === 'bigint')
      return { __type: 'BigInt', value: value.toString() };
  if (Array.isArray(value)) {
      return value.map((item) => serializeValue(item, opts));
  }
  if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
  }
  if (value instanceof ArrayBuffer) {
      return { __type: 'ArrayBuffer', data: Array.from(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
      const ctor = value.constructor && value.constructor.name;
      const view = value;
      let data = Array.from(view);
      if (data.length && typeof data[0] === 'bigint') {
          data = data.map((entry) => entry.toString());
      }
      return {
          __type: 'TypedArray',
          ctor: ctor !== null && ctor !== void 0 ? ctor : 'Uint8Array',
          data,
      };
  }
  if (typeof value === 'object') {
      if (opts.handle) {
          const maybeHandle = opts.handle(value);
          if (maybeHandle)
              return maybeHandle;
      }
      const entries = {};
      for (const key of Object.keys(value)) {
          entries[key] = serializeValue(value[key], opts);
      }
      return entries;
  }
  return value;
}
export function deserializeValue(value, opts = {}) {
  if (value === null || value === undefined)
      return value === null ? null : undefined;
  if (typeof value !== 'object')
      return value;
  if (value.__type === 'undefined')
      return undefined;
  if (value.__type === 'Date')
      return new Date(value.value);
  if (value.__type === 'BigInt')
      return BigInt(value.value);
  if (value.__type === 'ArrayBuffer') {
      return new Uint8Array(value.data).buffer;
  }
  if (value.__type === 'TypedArray') {
      const ctor = TYPED_ARRAY_CTORS[value.ctor];
      if (!ctor) {
          return new Uint8Array(value.data);
      }
      if (value.ctor === 'BigInt64Array' || value.ctor === 'BigUint64Array') {
          const bigVals = value.data.map((v) => BigInt(v));
          return new ctor(bigVals);
      }
      return new ctor(value.data);
  }
  if (value.__type === 'Handle') {
      if (!opts.handle) {
          throw new Error('Handle descriptor received but no handler registered');
      }
      return opts.handle(value);
  }
  if (Array.isArray(value)) {
      return value.map((item) => deserializeValue(item, opts));
  }
  const result = {};
  for (const key of Object.keys(value)) {
      result[key] = deserializeValue(value[key], opts);
  }
  return result;
}
