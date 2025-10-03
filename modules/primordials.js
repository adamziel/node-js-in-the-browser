// ../lib/internal/per_context/primordials.js
var {
  defineProperty: ReflectDefineProperty,
  getOwnPropertyDescriptor: ReflectGetOwnPropertyDescriptor,
  ownKeys: ReflectOwnKeys
} = Reflect;
var { apply, bind, call } = Function.prototype;
var uncurryThis = bind.bind(call);
primordials.uncurryThis = uncurryThis;
var applyBind = bind.bind(apply);
primordials.applyBind = applyBind;
var varargsMethods = [
  // 'ArrayPrototypeConcat' is omitted, because it performs the spread
  // on its own for arrays and array-likes with a truthy
  // @@isConcatSpreadable symbol property.
  "ArrayOf",
  "ArrayPrototypePush",
  "ArrayPrototypeUnshift",
  // 'FunctionPrototypeCall' is omitted, since there's 'ReflectApply'
  // and 'FunctionPrototypeApply'.
  "MathHypot",
  "MathMax",
  "MathMin",
  "StringFromCharCode",
  "StringFromCodePoint",
  "StringPrototypeConcat",
  "TypedArrayOf"
];
function getNewKey(key) {
  return typeof key === "symbol" ? `Symbol${key.description[7].toUpperCase()}${key.description.slice(8)}` : `${key[0].toUpperCase()}${key.slice(1)}`;
}
function copyAccessor(dest, prefix, key, { enumerable, get, set }) {
  ReflectDefineProperty(dest, `${prefix}Get${key}`, {
    __proto__: null,
    value: uncurryThis(get),
    enumerable
  });
  if (set !== void 0) {
    ReflectDefineProperty(dest, `${prefix}Set${key}`, {
      __proto__: null,
      value: uncurryThis(set),
      enumerable
    });
  }
}
function copyPropsRenamed(src, dest, prefix) {
  for (const key of ReflectOwnKeys(src)) {
    const newKey = getNewKey(key);
    const desc = ReflectGetOwnPropertyDescriptor(src, key);
    if ("get" in desc) {
      copyAccessor(dest, prefix, newKey, desc);
    } else {
      const name = `${prefix}${newKey}`;
      ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
      if (varargsMethods.includes(name)) {
        ReflectDefineProperty(dest, `${name}Apply`, {
          __proto__: null,
          // `src` is bound as the `this` so that the static `this` points
          // to the object it was defined on,
          // e.g.: `ArrayOfApply` gets a `this` of `Array`:
          value: applyBind(desc.value, src)
        });
      }
    }
  }
}
function copyPropsRenamedBound(src, dest, prefix) {
  for (const key of ReflectOwnKeys(src)) {
    const newKey = getNewKey(key);
    const desc = ReflectGetOwnPropertyDescriptor(src, key);
    if ("get" in desc) {
      copyAccessor(dest, prefix, newKey, desc);
    } else {
      const { value } = desc;
      if (typeof value === "function") {
        desc.value = value.bind(src);
      }
      const name = `${prefix}${newKey}`;
      ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
      if (varargsMethods.includes(name)) {
        ReflectDefineProperty(dest, `${name}Apply`, {
          __proto__: null,
          value: applyBind(value, src)
        });
      }
    }
  }
}
function copyPrototype(src, dest, prefix) {
  for (const key of ReflectOwnKeys(src)) {
    const newKey = getNewKey(key);
    const desc = ReflectGetOwnPropertyDescriptor(src, key);
    if ("get" in desc) {
      copyAccessor(dest, prefix, newKey, desc);
    } else {
      const { value } = desc;
      if (typeof value === "function") {
        desc.value = uncurryThis(value);
      }
      const name = `${prefix}${newKey}`;
      ReflectDefineProperty(dest, name, { __proto__: null, ...desc });
      if (varargsMethods.includes(name)) {
        ReflectDefineProperty(dest, `${name}Apply`, {
          __proto__: null,
          value: applyBind(value)
        });
      }
    }
  }
}
[
  "Proxy",
  "globalThis"
].forEach((name) => {
  primordials[name] = globalThis[name];
});
[
  decodeURI,
  decodeURIComponent,
  encodeURI,
  encodeURIComponent
].forEach((fn) => {
  primordials[fn.name] = fn;
});
[
  escape,
  eval,
  unescape
].forEach((fn) => {
  primordials[fn.name] = fn;
});
[
  "Atomics",
  "JSON",
  "Math",
  "Proxy",
  "Reflect"
].forEach((name) => {
  copyPropsRenamed(globalThis[name], primordials, name);
});
[
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float32Array",
  "Float64Array",
  "Function",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "Map",
  "Number",
  "Object",
  "RangeError",
  "ReferenceError",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Uint16Array",
  "Uint32Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "WeakMap",
  "WeakRef",
  "WeakSet"
].forEach((name) => {
  const original = globalThis[name];
  primordials[name] = original;
  copyPropsRenamed(original, primordials, name);
  copyPrototype(original.prototype, primordials, `${name}Prototype`);
});
[
  "Promise"
].forEach((name) => {
  const original = globalThis[name];
  primordials[name] = original;
  copyPropsRenamedBound(original, primordials, name);
  copyPrototype(original.prototype, primordials, `${name}Prototype`);
});
[
  { name: "TypedArray", original: Reflect.getPrototypeOf(Uint8Array) },
  { name: "ArrayIterator", original: {
    prototype: Reflect.getPrototypeOf(Array.prototype[Symbol.iterator]())
  } },
  { name: "StringIterator", original: {
    prototype: Reflect.getPrototypeOf(String.prototype[Symbol.iterator]())
  } }
].forEach(({ name, original }) => {
  primordials[name] = original;
  copyPrototype(original, primordials, name);
  copyPrototype(original.prototype, primordials, `${name}Prototype`);
});
primordials.IteratorPrototype = Reflect.getPrototypeOf(primordials.ArrayIteratorPrototype);
var {
  Array: ArrayConstructor,
  ArrayPrototypeForEach,
  ArrayPrototypeMap,
  FinalizationRegistry,
  FunctionPrototypeCall,
  Map,
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectFreeze,
  ObjectSetPrototypeOf,
  Promise: Promise2,
  PromisePrototypeThen,
  PromiseResolve,
  ReflectApply,
  ReflectConstruct,
  ReflectGet,
  ReflectSet,
  RegExp,
  RegExpPrototype,
  RegExpPrototypeExec,
  RegExpPrototypeGetDotAll,
  RegExpPrototypeGetFlags,
  RegExpPrototypeGetGlobal,
  RegExpPrototypeGetHasIndices,
  RegExpPrototypeGetIgnoreCase,
  RegExpPrototypeGetMultiline,
  RegExpPrototypeGetSource,
  RegExpPrototypeGetSticky,
  RegExpPrototypeGetUnicode,
  Set,
  SymbolIterator,
  SymbolMatch,
  SymbolMatchAll,
  SymbolReplace,
  SymbolSearch,
  SymbolSpecies,
  SymbolSplit,
  WeakMap,
  WeakRef,
  WeakSet
} = primordials;
var createSafeIterator = (factory, next) => {
  class SafeIterator {
    constructor(iterable) {
      this._iterator = factory(iterable);
    }
    next() {
      return next(this._iterator);
    }
    [SymbolIterator]() {
      return this;
    }
  }
  ObjectSetPrototypeOf(SafeIterator.prototype, null);
  ObjectFreeze(SafeIterator.prototype);
  ObjectFreeze(SafeIterator);
  return SafeIterator;
};
primordials.SafeArrayIterator = createSafeIterator(
  primordials.ArrayPrototypeSymbolIterator,
  primordials.ArrayIteratorPrototypeNext
);
primordials.SafeStringIterator = createSafeIterator(
  primordials.StringPrototypeSymbolIterator,
  primordials.StringIteratorPrototypeNext
);
var copyProps = (src, dest) => {
  ArrayPrototypeForEach(ReflectOwnKeys(src), (key) => {
    if (!ReflectGetOwnPropertyDescriptor(dest, key)) {
      ReflectDefineProperty(
        dest,
        key,
        { __proto__: null, ...ReflectGetOwnPropertyDescriptor(src, key) }
      );
    }
  });
};
var makeSafe = (unsafe, safe) => {
  if (SymbolIterator in unsafe.prototype) {
    const dummy = new unsafe();
    let next;
    ArrayPrototypeForEach(ReflectOwnKeys(unsafe.prototype), (key) => {
      if (!ReflectGetOwnPropertyDescriptor(safe.prototype, key)) {
        const desc = ReflectGetOwnPropertyDescriptor(unsafe.prototype, key);
        if (typeof desc.value === "function" && desc.value.length === 0 && SymbolIterator in (FunctionPrototypeCall(desc.value, dummy) ?? {})) {
          const createIterator = uncurryThis(desc.value);
          next ??= uncurryThis(createIterator(dummy).next);
          const SafeIterator = createSafeIterator(createIterator, next);
          desc.value = function() {
            return new SafeIterator(this);
          };
        }
        ReflectDefineProperty(safe.prototype, key, { __proto__: null, ...desc });
      }
    });
  } else {
    copyProps(unsafe.prototype, safe.prototype);
  }
  copyProps(unsafe, safe);
  ObjectSetPrototypeOf(safe.prototype, null);
  ObjectFreeze(safe.prototype);
  ObjectFreeze(safe);
  return safe;
};
primordials.makeSafe = makeSafe;
primordials.SafeMap = makeSafe(
  Map,
  class SafeMap extends Map {
  }
);
primordials.SafeWeakMap = makeSafe(
  WeakMap,
  class SafeWeakMap extends WeakMap {
  }
);
primordials.SafeSet = makeSafe(
  Set,
  class SafeSet extends Set {
  }
);
primordials.SafeWeakSet = makeSafe(
  WeakSet,
  class SafeWeakSet extends WeakSet {
  }
);
primordials.SafeFinalizationRegistry = makeSafe(
  FinalizationRegistry,
  class SafeFinalizationRegistry extends FinalizationRegistry {
  }
);
primordials.SafeWeakRef = makeSafe(
  WeakRef,
  class SafeWeakRef extends WeakRef {
  }
);
var SafePromise = makeSafe(
  Promise2,
  class SafePromise2 extends Promise2 {
  }
);
primordials.SafePromisePrototypeFinally = (thisPromise, onFinally) => (
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise2(
    (a, b) => new SafePromise((a2, b2) => PromisePrototypeThen(thisPromise, a2, b2)).finally(onFinally).then(a, b)
  )
);
primordials.AsyncIteratorPrototype = primordials.ReflectGetPrototypeOf(
  primordials.ReflectGetPrototypeOf(
    async function* () {
    }
  ).prototype
);
var arrayToSafePromiseIterable = (promises, mapFn) => new primordials.SafeArrayIterator(
  ArrayPrototypeMap(
    promises,
    (promise, i) => new SafePromise((a, b) => PromisePrototypeThen(mapFn == null ? promise : mapFn(promise, i), a, b))
  )
);
primordials.SafePromiseAll = (promises, mapFn) => (
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise2(
    (a, b) => SafePromise.all(arrayToSafePromiseIterable(promises, mapFn)).then(a, b)
  )
);
primordials.SafePromiseAllReturnArrayLike = (promises, mapFn) => new Promise2((resolve, reject) => {
  const { length } = promises;
  const returnVal = ArrayConstructor(length);
  ObjectSetPrototypeOf(returnVal, null);
  if (length === 0) resolve(returnVal);
  let pendingPromises = length;
  for (let i = 0; i < length; i++) {
    const promise = mapFn != null ? mapFn(promises[i], i) : promises[i];
    PromisePrototypeThen(PromiseResolve(promise), (result) => {
      returnVal[i] = result;
      if (--pendingPromises === 0) resolve(returnVal);
    }, reject);
  }
});
primordials.SafePromiseAllReturnVoid = (promises, mapFn) => new Promise2((resolve, reject) => {
  let pendingPromises = promises.length;
  if (pendingPromises === 0) resolve();
  const onFulfilled = () => {
    if (--pendingPromises === 0) {
      resolve();
    }
  };
  for (let i = 0; i < promises.length; i++) {
    const promise = mapFn != null ? mapFn(promises[i], i) : promises[i];
    PromisePrototypeThen(PromiseResolve(promise), onFulfilled, reject);
  }
});
primordials.SafePromiseAllSettled = (promises, mapFn) => (
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise2(
    (a, b) => SafePromise.allSettled(arrayToSafePromiseIterable(promises, mapFn)).then(a, b)
  )
);
primordials.SafePromiseAllSettledReturnVoid = (promises, mapFn) => new Promise2((resolve) => {
  let pendingPromises = promises.length;
  if (pendingPromises === 0) resolve();
  const onSettle = () => {
    if (--pendingPromises === 0) resolve();
  };
  for (let i = 0; i < promises.length; i++) {
    const promise = mapFn != null ? mapFn(promises[i], i) : promises[i];
    PromisePrototypeThen(PromiseResolve(promise), onSettle, onSettle);
  }
});
primordials.SafePromiseAny = (promises, mapFn) => (
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise2(
    (a, b) => SafePromise.any(arrayToSafePromiseIterable(promises, mapFn)).then(a, b)
  )
);
primordials.SafePromiseRace = (promises, mapFn) => (
  // Wrapping on a new Promise is necessary to not expose the SafePromise
  // prototype to user-land.
  new Promise2(
    (a, b) => SafePromise.race(arrayToSafePromiseIterable(promises, mapFn)).then(a, b)
  )
);
var {
  exec: OriginalRegExpPrototypeExec,
  [SymbolMatch]: OriginalRegExpPrototypeSymbolMatch,
  [SymbolMatchAll]: OriginalRegExpPrototypeSymbolMatchAll,
  [SymbolReplace]: OriginalRegExpPrototypeSymbolReplace,
  [SymbolSearch]: OriginalRegExpPrototypeSymbolSearch,
  [SymbolSplit]: OriginalRegExpPrototypeSymbolSplit
} = RegExpPrototype;
var RegExpLikeForStringSplitting = class {
  #regex;
  constructor() {
    this.#regex = ReflectConstruct(RegExp, arguments);
  }
  get lastIndex() {
    return ReflectGet(this.#regex, "lastIndex");
  }
  set lastIndex(value) {
    ReflectSet(this.#regex, "lastIndex", value);
  }
  exec() {
    return ReflectApply(OriginalRegExpPrototypeExec, this.#regex, arguments);
  }
};
ObjectSetPrototypeOf(RegExpLikeForStringSplitting.prototype, null);
primordials.hardenRegExp = function hardenRegExp(pattern) {
  ObjectDefineProperties(pattern, {
    [SymbolMatch]: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeSymbolMatch
    },
    [SymbolMatchAll]: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeSymbolMatchAll
    },
    [SymbolReplace]: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeSymbolReplace
    },
    [SymbolSearch]: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeSymbolSearch
    },
    [SymbolSplit]: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeSymbolSplit
    },
    constructor: {
      __proto__: null,
      configurable: true,
      value: {
        [SymbolSpecies]: RegExpLikeForStringSplitting
      }
    },
    dotAll: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetDotAll(pattern)
    },
    exec: {
      __proto__: null,
      configurable: true,
      value: OriginalRegExpPrototypeExec
    },
    global: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetGlobal(pattern)
    },
    hasIndices: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetHasIndices(pattern)
    },
    ignoreCase: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetIgnoreCase(pattern)
    },
    multiline: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetMultiline(pattern)
    },
    source: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetSource(pattern)
    },
    sticky: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetSticky(pattern)
    },
    unicode: {
      __proto__: null,
      configurable: true,
      value: RegExpPrototypeGetUnicode(pattern)
    }
  });
  ObjectDefineProperty(pattern, "flags", {
    __proto__: null,
    configurable: true,
    value: RegExpPrototypeGetFlags(pattern)
  });
  return pattern;
};
primordials.SafeStringPrototypeSearch = (str, regexp) => {
  regexp.lastIndex = 0;
  const match = RegExpPrototypeExec(regexp, str);
  return match ? match.index : -1;
};
ObjectSetPrototypeOf(primordials, null);
ObjectFreeze(primordials);
