import {
  __esm,
  __export
} from "./chunk-IWXS4Z3P.js";

// src/this-is-bundled/node-lib/vm.js
var vm_exports = {};
__export(vm_exports, {
  default: () => vm_default
});
function runInThisContext(code, filename) {
  if (typeof code !== "string") {
    throw new TypeError("Code must be a string");
  }
  try {
    const func = new Function(`return (${code})`);
    return func();
  } catch (e) {
    if (e instanceof SyntaxError) {
      try {
        const func = new Function(code);
        return func();
      } catch (error) {
        if (filename && error instanceof Error) {
          error.message = `${filename}: ${error.message}`;
        }
        throw error;
      }
    }
    if (filename && e instanceof Error) {
      e.message = `${filename}: ${e.message}`;
    }
    throw e;
  }
}
function runInNewContext(code, context, filename) {
  if (typeof code !== "string") {
    throw new TypeError("Code must be a string");
  }
  if (context && typeof context !== "object") {
    throw new TypeError("Context must be an object");
  }
  const contextVars = context || {};
  const contextKeys = Object.keys(contextVars);
  const contextValues = Object.values(contextVars);
  const funcParams = contextKeys.join(", ");
  const funcBody = `
    'use strict';
    ${code}
  `;
  try {
    const func = new Function(...contextKeys, funcBody);
    return func(...contextValues);
  } catch (error) {
    if (filename && error instanceof Error) {
      error.message = `${filename}: ${error.message}`;
    }
    throw error;
  }
}
function runInContext(code, context, filename) {
  return runInNewContext(code, context, filename);
}
function createContext(context = {}) {
  if (typeof context !== "object") {
    throw new TypeError("Context must be an object");
  }
  return { ...context };
}
function runInContextifiedSandbox(code, contextifiedSandbox, options = {}) {
  if (typeof code !== "string") {
    throw new TypeError("Code must be a string");
  }
  if (contextifiedSandbox && typeof contextifiedSandbox !== "object") {
    throw new TypeError("Contextified sandbox must be an object");
  }
  const context = contextifiedSandbox || {};
  const filename = options.filename;
  const timeout = options.timeout;
  const contextKeys = Object.keys(context);
  const contextValues = Object.values(context);
  const funcParams = contextKeys.join(", ");
  const funcBody = `
    'use strict';
    ${code}
  `;
  try {
    const func = new Function(...contextKeys, funcBody);
    if (timeout && timeout > 0) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Script execution timed out after ${timeout}ms`));
        }, timeout);
        try {
          const result = func(...contextValues);
          clearTimeout(timer);
          resolve(result);
        } catch (error) {
          clearTimeout(timer);
          if (filename && error instanceof Error) {
            error.message = `${filename}: ${error.message}`;
          }
          reject(error);
        }
      });
    }
    return func(...contextValues);
  } catch (error) {
    if (filename && error instanceof Error) {
      error.message = `${filename}: ${error.message}`;
    }
    throw error;
  }
}
var Script, vm_default;
var init_vm = __esm({
  "src/this-is-bundled/node-lib/vm.js"() {
    Script = class {
      constructor(code, options = {}) {
        if (typeof code !== "string") {
          throw new TypeError("Code must be a string");
        }
        this.code = code;
        this.filename = options.filename;
        this.timeout = options.timeout;
        this._compiledFunction = null;
        this._compile();
      }
      _compile() {
        try {
          this._compiledFunction = new Function(`return (${this.code})`);
          this._isExpression = true;
        } catch (e) {
          if (e instanceof SyntaxError) {
            try {
              this._compiledFunction = new Function(this.code);
              this._isExpression = false;
            } catch (error) {
              if (this.filename && error instanceof Error) {
                error.message = `${this.filename}: ${error.message}`;
              }
              throw error;
            }
          } else {
            throw e;
          }
        }
      }
      runInThisContext(options = {}) {
        const timeout = options.timeout !== void 0 ? options.timeout : this.timeout;
        if (timeout && timeout > 0) {
          return this._runWithTimeout(timeout);
        }
        try {
          return this._compiledFunction();
        } catch (error) {
          if (this.filename && error instanceof Error) {
            error.message = `${this.filename}: ${error.message}`;
          }
          throw error;
        }
      }
      runInNewContext(context, options = {}) {
        if (context && typeof context !== "object") {
          throw new TypeError("Context must be an object");
        }
        const timeout = options.timeout !== void 0 ? options.timeout : this.timeout;
        const contextVars = context || {};
        const contextKeys = Object.keys(contextVars);
        const contextValues = Object.values(contextVars);
        const funcParams = contextKeys.join(", ");
        const funcBody = `
      'use strict';
      ${this.code}
    `;
        try {
          const func = new Function(...contextKeys, funcBody);
          if (timeout && timeout > 0) {
            return this._runWithTimeout(timeout, () => func(...contextValues));
          }
          return func(...contextValues);
        } catch (error) {
          if (this.filename && error instanceof Error) {
            error.message = `${this.filename}: ${error.message}`;
          }
          throw error;
        }
      }
      runInContext(contextifiedSandbox, options = {}) {
        return this.runInNewContext(contextifiedSandbox, options);
      }
      _runWithTimeout(timeout, fn) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Script execution timed out after ${timeout}ms`));
          }, timeout);
          try {
            const result = fn ? fn() : this._compiledFunction();
            clearTimeout(timer);
            resolve(result);
          } catch (error) {
            clearTimeout(timer);
            if (this.filename && error instanceof Error) {
              error.message = `${this.filename}: ${error.message}`;
            }
            reject(error);
          }
        });
      }
      createCachedData() {
        return null;
      }
    };
    vm_default = {
      runInThisContext,
      runInNewContext,
      runInContext,
      createContext,
      runInContextifiedSandbox,
      Script,
      // Constants
      constants: {
        CACHE_LINE_SIZE: 64,
        HEAP_SIZE_USED: 0,
        HEAP_SIZE_TOTAL: 0,
        HEAP_SIZE_EXECUTABLE: 0,
        HEAP_SIZE_LIMIT: 0
      }
    };
  }
});

export {
  vm_default,
  vm_exports,
  init_vm
};
