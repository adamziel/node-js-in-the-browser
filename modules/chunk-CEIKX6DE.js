import {
  require_abort_listener,
  require_errors,
  require_interface,
  require_util3 as require_util,
  require_utils,
  require_utils2,
  require_validators
} from "./chunk-YRNOAZC4.js";
import {
  __commonJS
} from "./chunk-EKOWL7XK.js";

// ../lib/internal/readline/promises.js
var require_promises = __commonJS({
  "../lib/internal/readline/promises.js"(exports, module) {
    "use strict";
    var {
      ArrayPrototypeJoin,
      ArrayPrototypePush,
      Promise: Promise2
    } = primordials;
    var { CSI } = require_utils2();
    var { validateBoolean, validateInteger } = require_validators();
    var { isWritable } = require_utils();
    var { codes: {
      ERR_INVALID_ARG_TYPE
    } } = require_errors();
    var {
      kClearToLineBeginning,
      kClearToLineEnd,
      kClearLine,
      kClearScreenDown
    } = CSI;
    var Readline = class {
      #autoCommit = false;
      #stream;
      #todo = [];
      constructor(stream, options = void 0) {
        if (!isWritable(stream))
          throw new ERR_INVALID_ARG_TYPE("stream", "Writable", stream);
        this.#stream = stream;
        if (options?.autoCommit != null) {
          validateBoolean(options.autoCommit, "options.autoCommit");
          this.#autoCommit = options.autoCommit;
        }
      }
      /**
       * Moves the cursor to the x and y coordinate on the given stream.
       * @param {integer} x
       * @param {integer} [y]
       * @returns {Readline} this
       */
      cursorTo(x, y = void 0) {
        validateInteger(x, "x");
        if (y != null) validateInteger(y, "y");
        const data = y == null ? CSI`${x + 1}G` : CSI`${y + 1};${x + 1}H`;
        if (this.#autoCommit) globalThis.process.nextTick(() => this.#stream.write(data));
        else ArrayPrototypePush(this.#todo, data);
        return this;
      }
      /**
       * Moves the cursor relative to its current location.
       * @param {integer} dx
       * @param {integer} dy
       * @returns {Readline} this
       */
      moveCursor(dx, dy) {
        if (dx || dy) {
          validateInteger(dx, "dx");
          validateInteger(dy, "dy");
          let data = "";
          if (dx < 0) {
            data += CSI`${-dx}D`;
          } else if (dx > 0) {
            data += CSI`${dx}C`;
          }
          if (dy < 0) {
            data += CSI`${-dy}A`;
          } else if (dy > 0) {
            data += CSI`${dy}B`;
          }
          if (this.#autoCommit) globalThis.process.nextTick(() => this.#stream.write(data));
          else ArrayPrototypePush(this.#todo, data);
        }
        return this;
      }
      /**
       * Clears the current line the cursor is on.
       * @param {-1|0|1} dir Direction to clear:
       *   -1 for left of the cursor
       *   +1 for right of the cursor
       *   0 for the entire line
       * @returns {Readline} this
       */
      clearLine(dir) {
        validateInteger(dir, "dir", -1, 1);
        const data = dir < 0 ? kClearToLineBeginning : dir > 0 ? kClearToLineEnd : kClearLine;
        if (this.#autoCommit) globalThis.process.nextTick(() => this.#stream.write(data));
        else ArrayPrototypePush(this.#todo, data);
        return this;
      }
      /**
       * Clears the screen from the current position of the cursor down.
       * @returns {Readline} this
       */
      clearScreenDown() {
        if (this.#autoCommit) {
          globalThis.process.nextTick(() => this.#stream.write(kClearScreenDown));
        } else {
          ArrayPrototypePush(this.#todo, kClearScreenDown);
        }
        return this;
      }
      /**
       * Sends all the pending actions to the associated `stream` and clears the
       * internal list of pending actions.
       * @returns {Promise<void>} Resolves when all pending actions have been
       *   flushed to the associated `stream`.
       */
      commit() {
        return new Promise2((resolve) => {
          this.#stream.write(ArrayPrototypeJoin(this.#todo, ""), resolve);
          this.#todo = [];
        });
      }
      /**
       * Clears the internal list of pending actions without sending it to the
       * associated `stream`.
       * @returns {Readline} this
       */
      rollback() {
        this.#todo = [];
        return this;
      }
    };
    module.exports = {
      Readline
    };
  }
});

// ../lib/readline/promises.js
var require_promises2 = __commonJS({
  "../lib/readline/promises.js"(exports, module) {
    var {
      Promise: Promise2,
      SymbolDispose
    } = primordials;
    var {
      Readline
    } = require_promises();
    var {
      Interface: _Interface,
      kQuestion,
      kQuestionCancel,
      kQuestionReject
    } = require_interface();
    var {
      AbortError
    } = require_errors();
    var { validateAbortSignal } = require_validators();
    var {
      kEmptyObject
    } = require_util();
    var addAbortListener;
    var Interface = class extends _Interface {
      question(query, options = kEmptyObject) {
        return new Promise2((resolve, reject) => {
          let cb = resolve;
          if (options?.signal) {
            validateAbortSignal(options.signal, "options.signal");
            if (options.signal.aborted) {
              return reject(
                new AbortError(void 0, { cause: options.signal.reason })
              );
            }
            const onAbort = () => {
              this[kQuestionCancel]();
              reject(new AbortError(void 0, { cause: options.signal.reason }));
            };
            addAbortListener ??= require_abort_listener().addAbortListener;
            const disposable = addAbortListener(options.signal, onAbort);
            cb = (answer) => {
              disposable[SymbolDispose]();
              resolve(answer);
            };
          }
          this[kQuestionReject] = reject;
          this[kQuestion](query, cb);
        });
      }
    };
    function createInterface(input, output, completer, terminal) {
      return new Interface(input, output, completer, terminal);
    }
    module.exports = {
      Interface,
      Readline,
      createInterface
    };
  }
});

export {
  require_promises2 as require_promises
};
