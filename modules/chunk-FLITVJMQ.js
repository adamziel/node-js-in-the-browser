import {
  __esm,
  __export
} from "./chunk-2ESYSVXG.js";

// to-modularize/vm.js
var vm_exports = {};
__export(vm_exports, {
  runInThisContext: () => runInThisContext,
  vmPolyfill: () => vmPolyfill
});
var runInThisContext, vmPolyfill;
var init_vm = __esm({
  "to-modularize/vm.js"() {
    runInThisContext = (code, filename) => {
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
    };
    vmPolyfill = {
      runInThisContext
    };
  }
});

export {
  runInThisContext,
  vmPolyfill,
  vm_exports,
  init_vm
};
