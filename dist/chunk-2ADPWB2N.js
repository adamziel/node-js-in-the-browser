import {
  __commonJS
} from "./chunk-IWXS4Z3P.js";

// node/lib/internal/bootstrap/realm.js
var require_realm = __commonJS({
  "node/lib/internal/bootstrap/realm.js"(exports, module) {
    var {
      ArrayFrom,
      ArrayPrototypeFilter,
      ArrayPrototypeIncludes,
      ArrayPrototypeMap,
      ArrayPrototypePush,
      ArrayPrototypePushApply,
      ArrayPrototypeSlice,
      Error,
      ObjectDefineProperty,
      ObjectKeys,
      ObjectPrototypeHasOwnProperty,
      ObjectSetPrototypeOf,
      ReflectGet,
      SafeMap,
      SafeSet,
      String,
      StringPrototypeSlice,
      StringPrototypeStartsWith,
      TypeError
    } = primordials;
    var moduleLoadList = [];
    ObjectDefineProperty(globalThis.process, "moduleLoadList", {
      __proto__: null,
      value: moduleLoadList,
      configurable: true,
      enumerable: true,
      writable: false
    });
    var processBindingAllowList = new SafeSet([
      "buffer",
      "cares_wrap",
      "config",
      "constants",
      "contextify",
      "fs",
      "fs_event_wrap",
      "icu",
      "inspector",
      "js_stream",
      "os",
      "pipe_wrap",
      "process_wrap",
      "spawn_sync",
      "stream_wrap",
      "tcp_wrap",
      "tls_wrap",
      "tty_wrap",
      "udp_wrap",
      "uv",
      "zlib"
    ]);
    var runtimeDeprecatedList = new SafeSet([
      // The list of runtime-deprecated bindings is currently empty.
    ]);
    var legacyWrapperList = new SafeSet([
      "natives",
      "util"
    ]);
    var schemelessBlockList = new SafeSet([
      "sea",
      "sqlite",
      "quic",
      "test",
      "test/reporters"
    ]);
    var experimentalModuleList = new SafeSet(["sqlite", "quic"]);
    {
      const bindingObj = { __proto__: null };
      globalThis.process.binding = function binding(module2) {
        module2 = String(module2);
        const mod = bindingObj[module2];
        if (typeof mod === "object") {
          return mod;
        }
        if (runtimeDeprecatedList.has(module2)) {
          globalThis.process.emitWarning(
            `Access to process.binding('${module2}') is deprecated.`,
            "DeprecationWarning",
            "DEP0111"
          );
          return internalBinding(module2);
        }
        if (legacyWrapperList.has(module2)) {
          return requireBuiltin("internal/legacy/processbinding")[module2]();
        }
        if (processBindingAllowList.has(module2)) {
          return internalBinding(module2);
        }
        throw new Error(`No such module: ${module2}`);
      };
      globalThis.process._linkedBinding = function _linkedBinding(module2) {
        module2 = String(module2);
        let mod = bindingObj[module2];
        if (typeof mod !== "object")
          mod = bindingObj[module2] = getLinkedBinding(module2);
        return mod;
      };
    }
    var internalBinding;
    {
      const bindingObj = { __proto__: null };
      internalBinding = function internalBinding2(module2) {
        let mod = bindingObj[module2];
        if (typeof mod !== "object") {
          mod = bindingObj[module2] = getInternalBinding(module2);
          ArrayPrototypePush(moduleLoadList, `Internal Binding ${module2}`);
        }
        return mod;
      };
    }
    var selfId = "internal/bootstrap/realm";
    var {
      builtinIds,
      compileFunction,
      setInternalLoaders
    } = internalBinding("builtins");
    var { ModuleWrap } = internalBinding("module_wrap");
    ObjectSetPrototypeOf(ModuleWrap.prototype, null);
    var getOwn = (target, property, receiver) => {
      return ObjectPrototypeHasOwnProperty(target, property) ? ReflectGet(target, property, receiver) : void 0;
    };
    var publicBuiltinIds = builtinIds.filter(
      (id) => !StringPrototypeStartsWith(id, "internal/") && !experimentalModuleList.has(id)
    );
    var internalBuiltinIds = builtinIds.filter((id) => StringPrototypeStartsWith(id, "internal/") && id !== selfId);
    var canBeRequiredByUsersList = new SafeSet(publicBuiltinIds);
    var canBeRequiredByUsersWithoutSchemeList = new SafeSet(publicBuiltinIds.filter((id) => !schemelessBlockList.has(id)));
    var BuiltinModule = class _BuiltinModule {
      /**
       * A map from the module IDs to the module instances.
       * @type {Map<string, BuiltinModule>}
       */
      static map = new SafeMap(
        ArrayPrototypeMap(builtinIds, (id) => [id, new _BuiltinModule(id)])
      );
      constructor(id) {
        this.filename = `${id}.js`;
        this.id = id;
        this.exports = {};
        this.loaded = false;
        this.loading = false;
        this.module = void 0;
        this.exportKeys = void 0;
      }
      static allowRequireByUsers(id) {
        if (id === selfId) {
          throw new Error(`Should not allow ${id}`);
        }
        canBeRequiredByUsersList.add(id);
        if (!schemelessBlockList.has(id)) {
          canBeRequiredByUsersWithoutSchemeList.add(id);
        }
      }
      static setRealmAllowRequireByUsers(ids) {
        canBeRequiredByUsersList = new SafeSet(ArrayPrototypeFilter(ids, (id) => ArrayPrototypeIncludes(publicBuiltinIds, id)));
        canBeRequiredByUsersWithoutSchemeList = new SafeSet(ArrayPrototypeFilter(ids, (id) => !schemelessBlockList.has(id)));
      }
      // To be called during pre-execution when --expose-internals is on.
      // Enables the user-land module loader to access internal modules.
      static exposeInternals() {
        for (let i = 0; i < internalBuiltinIds.length; ++i) {
          _BuiltinModule.allowRequireByUsers(internalBuiltinIds[i]);
        }
      }
      static exists(id) {
        return _BuiltinModule.map.has(id);
      }
      static canBeRequiredByUsers(id) {
        return canBeRequiredByUsersList.has(id);
      }
      static canBeRequiredWithoutScheme(id) {
        return canBeRequiredByUsersWithoutSchemeList.has(id);
      }
      static normalizeRequirableId(id) {
        if (StringPrototypeStartsWith(id, "node:")) {
          const normalizedId = StringPrototypeSlice(id, 5);
          if (_BuiltinModule.canBeRequiredByUsers(normalizedId)) {
            return normalizedId;
          }
        } else if (_BuiltinModule.canBeRequiredWithoutScheme(id)) {
          return id;
        }
        return void 0;
      }
      static isBuiltin(id) {
        return _BuiltinModule.canBeRequiredWithoutScheme(id) || typeof id === "string" && StringPrototypeStartsWith(id, "node:") && _BuiltinModule.canBeRequiredByUsers(StringPrototypeSlice(id, 5));
      }
      static getSchemeOnlyModuleNames() {
        return ArrayFrom(schemelessBlockList);
      }
      static getAllBuiltinModuleIds() {
        const allBuiltins = ArrayFrom(canBeRequiredByUsersWithoutSchemeList);
        ArrayPrototypePushApply(allBuiltins, ArrayFrom(schemelessBlockList, (x) => `node:${x}`));
        return allBuiltins;
      }
      // Used by user-land module loaders to compile and load builtins.
      compileForPublicLoader() {
        if (!_BuiltinModule.canBeRequiredByUsers(this.id)) {
          throw new Error(`Should not compile ${this.id} for public use`);
        }
        this.compileForInternalLoader();
        if (!this.exportKeys) {
          const internal = StringPrototypeStartsWith(this.id, "internal/");
          this.exportKeys = internal ? [] : ObjectKeys(this.exports);
        }
        return this.exports;
      }
      getESMFacade() {
        if (this.module) return this.module;
        const url = `node:${this.id}`;
        const builtin = this;
        const exportsKeys = ArrayPrototypeSlice(this.exportKeys);
        if (!ArrayPrototypeIncludes(exportsKeys, "default")) {
          ArrayPrototypePush(exportsKeys, "default");
        }
        this.module = new ModuleWrap(
          url,
          void 0,
          exportsKeys,
          function() {
            builtin.syncExports();
            this.setExport("default", builtin.exports);
          }
        );
        this.module.instantiate();
        this.module.evaluate(-1, false);
        return this.module;
      }
      // Provide named exports for all builtin libraries so that the libraries
      // may be imported in a nicer way for ESM users. The default export is left
      // as the entire namespace (module.exports) and updates when this function is
      // called so that APMs and other behavior are supported.
      syncExports() {
        const names = this.exportKeys;
        if (this.module) {
          for (let i = 0; i < names.length; i++) {
            const exportName = names[i];
            if (exportName === "default") continue;
            this.module.setExport(
              exportName,
              getOwn(this.exports, exportName, this.exports)
            );
          }
        }
      }
      compileForInternalLoader() {
        if (this.loaded || this.loading) {
          return this.exports;
        }
        const id = this.id;
        this.loading = true;
        try {
          const requireFn = StringPrototypeStartsWith(this.id, "internal/deps/") ? requireWithFallbackInDeps : requireBuiltin;
          const fn = compileFunction(id);
          fn(this.exports, requireFn, this, globalThis.process, internalBinding, primordials);
          this.loaded = true;
        } finally {
          this.loading = false;
        }
        ArrayPrototypePush(moduleLoadList, `NativeModule ${id}`);
        return this.exports;
      }
    };
    var loaderExports = {
      internalBinding,
      BuiltinModule,
      require: requireBuiltin
    };
    function requireBuiltin(id) {
      if (id === selfId) {
        return loaderExports;
      }
      const mod = BuiltinModule.map.get(id);
      if (!mod) throw new TypeError(`Missing internal module '${id}'`);
      return mod.compileForInternalLoader();
    }
    function requireWithFallbackInDeps(request) {
      if (StringPrototypeStartsWith(request, "node:")) {
        request = StringPrototypeSlice(request, 5);
      } else if (!BuiltinModule.map.has(request)) {
        request = `internal/deps/${request}`;
      }
      return requireBuiltin(request);
    }
    function setupPrepareStackTrace() {
      return;
      const {
        setEnhanceStackForFatalException,
        setPrepareStackTraceCallback
      } = internalBinding("errors");
      const {
        prepareStackTraceCallback,
        ErrorPrepareStackTrace
        // fatalExceptionStackEnhancers: {
        //   beforeInspector,
        //   afterInspector,
        // },
      } = requireBuiltin("internal/errors");
      setPrepareStackTraceCallback(prepareStackTraceCallback);
      setEnhanceStackForFatalException(beforeInspector, afterInspector);
      ObjectDefineProperty(Error, "prepareStackTrace", {
        __proto__: null,
        writable: true,
        enumerable: false,
        configurable: true,
        value: ErrorPrepareStackTrace
      });
    }
    setInternalLoaders(internalBinding, requireBuiltin);
    setupPrepareStackTrace();
    module.exports = loaderExports;
  }
});

export {
  require_realm
};
