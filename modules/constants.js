import {
  __commonJS
} from "./chunk-IWXS4Z3P.js";

// ../lib/constants.js
var require_constants = __commonJS({
  "../lib/constants.js"(exports) {
    var {
      ObjectAssign,
      ObjectFreeze
    } = primordials;
    var constants = internalBinding("constants");
    ObjectAssign(
      exports,
      constants.os.dlopen,
      constants.os.errno,
      constants.os.priority,
      constants.os.signals,
      constants.fs,
      constants.crypto
    );
    ObjectFreeze(exports);
  }
});
export default require_constants();
