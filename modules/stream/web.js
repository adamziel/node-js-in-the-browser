import {
  require_adapters,
  require_assert,
  require_encoding,
  require_errors,
  require_js_transferable,
  require_queuingstrategies,
  require_readablestream,
  require_util,
  require_util3 as require_util2,
  require_validators,
  require_webidl,
  require_writablestream,
  require_zlib
} from "../chunk-66GQ4KXQ.js";
import "../chunk-R3FVOHFT.js";
import "../chunk-I42IIQEW.js";
import "../chunk-BVUF56MI.js";
import "../chunk-UWEHO5PT.js";
import "../chunk-NHS3F7JZ.js";
import "../chunk-YC7P67L4.js";
import {
  __commonJS
} from "../chunk-IWXS4Z3P.js";

// ../lib/internal/webstreams/transformstream.js
var require_transformstream = __commonJS({
  "../lib/internal/webstreams/transformstream.js"(exports, module) {
    "use strict";
    var {
      FunctionPrototypeCall,
      ObjectDefineProperties,
      ObjectSetPrototypeOf,
      PromisePrototypeThen,
      PromiseWithResolvers,
      Symbol,
      SymbolToStringTag
    } = primordials;
    var {
      codes: {
        ERR_ILLEGAL_CONSTRUCTOR,
        ERR_INVALID_ARG_VALUE,
        ERR_INVALID_STATE,
        ERR_INVALID_THIS
      }
    } = require_errors();
    var {
      DOMException
    } = internalBinding("messaging");
    var {
      customInspectSymbol: kInspect,
      kEmptyObject,
      kEnumerableProperty
    } = require_util2();
    var {
      validateObject,
      kValidateObjectAllowObjects,
      kValidateObjectAllowObjectsAndNull
    } = require_validators();
    var {
      kDeserialize,
      kTransfer,
      kTransferList,
      markTransferMode
    } = require_js_transferable();
    var {
      createPromiseCallback,
      customInspect,
      extractHighWaterMark,
      extractSizeAlgorithm,
      isBrandCheck,
      nonOpFlush,
      kType,
      kState,
      nonOpCancel
    } = require_util();
    var {
      createReadableStream,
      readableStreamDefaultControllerCanCloseOrEnqueue,
      readableStreamDefaultControllerClose,
      readableStreamDefaultControllerEnqueue,
      readableStreamDefaultControllerError,
      readableStreamDefaultControllerGetDesiredSize,
      readableStreamDefaultControllerHasBackpressure
    } = require_readablestream();
    var {
      createWritableStream,
      writableStreamDefaultControllerErrorIfNeeded
    } = require_writablestream();
    var assert = require_assert();
    var kSkipThrow = Symbol("kSkipThrow");
    var getNonWritablePropertyDescriptor = (value) => {
      return {
        __proto__: null,
        configurable: true,
        value
      };
    };
    var TransformStream = class {
      [kType] = "TransformStream";
      /**
       * @param {Transformer} [transformer]
       * @param {QueuingStrategy} [writableStrategy]
       * @param {QueuingStrategy} [readableStrategy]
       */
      constructor(transformer = kEmptyObject, writableStrategy = kEmptyObject, readableStrategy = kEmptyObject) {
        markTransferMode(this, false, true);
        validateObject(transformer, "transformer", kValidateObjectAllowObjects);
        validateObject(writableStrategy, "writableStrategy", kValidateObjectAllowObjectsAndNull);
        validateObject(readableStrategy, "readableStrategy", kValidateObjectAllowObjectsAndNull);
        const readableType = transformer?.readableType;
        const writableType = transformer?.writableType;
        const start = transformer?.start;
        if (readableType !== void 0) {
          throw new ERR_INVALID_ARG_VALUE.RangeError(
            "transformer.readableType",
            readableType
          );
        }
        if (writableType !== void 0) {
          throw new ERR_INVALID_ARG_VALUE.RangeError(
            "transformer.writableType",
            writableType
          );
        }
        const readableHighWaterMark = readableStrategy?.highWaterMark;
        const readableSize = readableStrategy?.size;
        const writableHighWaterMark = writableStrategy?.highWaterMark;
        const writableSize = writableStrategy?.size;
        const actualReadableHighWaterMark = extractHighWaterMark(readableHighWaterMark, 0);
        const actualReadableSize = extractSizeAlgorithm(readableSize);
        const actualWritableHighWaterMark = extractHighWaterMark(writableHighWaterMark, 1);
        const actualWritableSize = extractSizeAlgorithm(writableSize);
        const startPromise = PromiseWithResolvers();
        initializeTransformStream(
          this,
          startPromise,
          actualWritableHighWaterMark,
          actualWritableSize,
          actualReadableHighWaterMark,
          actualReadableSize
        );
        setupTransformStreamDefaultControllerFromTransformer(this, transformer);
        if (start !== void 0) {
          startPromise.resolve(
            FunctionPrototypeCall(
              start,
              transformer,
              this[kState].controller
            )
          );
        } else {
          startPromise.resolve();
        }
      }
      /**
       * @readonly
       * @type {ReadableStream}
       */
      get readable() {
        if (!isTransformStream(this))
          throw new ERR_INVALID_THIS("TransformStream");
        return this[kState].readable;
      }
      /**
       * @readonly
       * @type {WritableStream}
       */
      get writable() {
        if (!isTransformStream(this))
          throw new ERR_INVALID_THIS("TransformStream");
        return this[kState].writable;
      }
      [kInspect](depth, options) {
        return customInspect(depth, options, this[kType], {
          readable: this.readable,
          writable: this.writable,
          backpressure: this[kState].backpressure
        });
      }
      [kTransfer]() {
        if (!isTransformStream(this))
          throw new ERR_INVALID_THIS("TransformStream");
        const {
          readable,
          writable
        } = this[kState];
        if (readable.locked) {
          throw new DOMException(
            "Cannot transfer a locked ReadableStream",
            "DataCloneError"
          );
        }
        if (writable.locked) {
          throw new DOMException(
            "Cannot transfer a locked WritableStream",
            "DataCloneError"
          );
        }
        return {
          data: {
            readable,
            writable
          },
          deserializeInfo: "internal/webstreams/transformstream:TransferredTransformStream"
        };
      }
      [kTransferList]() {
        return [this[kState].readable, this[kState].writable];
      }
      [kDeserialize]({ readable, writable }) {
        this[kState].readable = readable;
        this[kState].writable = writable;
      }
    };
    ObjectDefineProperties(TransformStream.prototype, {
      readable: kEnumerableProperty,
      writable: kEnumerableProperty,
      [SymbolToStringTag]: getNonWritablePropertyDescriptor(TransformStream.name)
    });
    function InternalTransferredTransformStream() {
      ObjectSetPrototypeOf(this, TransformStream.prototype);
      markTransferMode(this, false, true);
      this[kType] = "TransformStream";
      this[kState] = {
        __proto__: null,
        readable: void 0,
        writable: void 0,
        backpressure: void 0,
        backpressureChange: {
          __proto__: null,
          promise: void 0,
          resolve: void 0,
          reject: void 0
        },
        controller: void 0
      };
    }
    ObjectSetPrototypeOf(InternalTransferredTransformStream.prototype, TransformStream.prototype);
    ObjectSetPrototypeOf(InternalTransferredTransformStream, TransformStream);
    function TransferredTransformStream() {
      const stream = new InternalTransferredTransformStream();
      stream.constructor = TransformStream;
      return stream;
    }
    TransferredTransformStream.prototype[kDeserialize] = () => {
    };
    var TransformStreamDefaultController = class {
      [kType] = "TransformStreamDefaultController";
      constructor(skipThrowSymbol = void 0) {
        if (skipThrowSymbol !== kSkipThrow) {
          throw new ERR_ILLEGAL_CONSTRUCTOR();
        }
      }
      /**
       * @readonly
       * @type {number}
       */
      get desiredSize() {
        if (!isTransformStreamDefaultController(this))
          throw new ERR_INVALID_THIS("TransformStreamDefaultController");
        const {
          stream
        } = this[kState];
        const {
          readable
        } = stream[kState];
        const {
          controller: readableController
        } = readable[kState];
        return readableStreamDefaultControllerGetDesiredSize(readableController);
      }
      /**
       * @param {any} [chunk]
       */
      enqueue(chunk = void 0) {
        if (!isTransformStreamDefaultController(this))
          throw new ERR_INVALID_THIS("TransformStreamDefaultController");
        transformStreamDefaultControllerEnqueue(this, chunk);
      }
      /**
       * @param {any} [reason]
       */
      error(reason = void 0) {
        if (!isTransformStreamDefaultController(this))
          throw new ERR_INVALID_THIS("TransformStreamDefaultController");
        transformStreamDefaultControllerError(this, reason);
      }
      terminate() {
        if (!isTransformStreamDefaultController(this))
          throw new ERR_INVALID_THIS("TransformStreamDefaultController");
        transformStreamDefaultControllerTerminate(this);
      }
      [kInspect](depth, options) {
        return customInspect(depth, options, this[kType], {
          stream: this[kState].stream
        });
      }
    };
    ObjectDefineProperties(TransformStreamDefaultController.prototype, {
      desiredSize: kEnumerableProperty,
      enqueue: kEnumerableProperty,
      error: kEnumerableProperty,
      terminate: kEnumerableProperty,
      [SymbolToStringTag]: getNonWritablePropertyDescriptor(TransformStreamDefaultController.name)
    });
    var isTransformStream = isBrandCheck("TransformStream");
    var isTransformStreamDefaultController = isBrandCheck("TransformStreamDefaultController");
    async function defaultTransformAlgorithm(chunk, controller) {
      transformStreamDefaultControllerEnqueue(controller, chunk);
    }
    function initializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm) {
      const startAlgorithm = () => startPromise.promise;
      const writable = createWritableStream(
        startAlgorithm,
        (chunk) => transformStreamDefaultSinkWriteAlgorithm(stream, chunk),
        () => transformStreamDefaultSinkCloseAlgorithm(stream),
        (reason) => transformStreamDefaultSinkAbortAlgorithm(stream, reason),
        writableHighWaterMark,
        writableSizeAlgorithm
      );
      const readable = createReadableStream(
        startAlgorithm,
        () => transformStreamDefaultSourcePullAlgorithm(stream),
        (reason) => transformStreamDefaultSourceCancelAlgorithm(stream, reason),
        readableHighWaterMark,
        readableSizeAlgorithm
      );
      stream[kState] = {
        __proto__: null,
        readable,
        writable,
        controller: void 0,
        backpressure: void 0,
        backpressureChange: {
          __proto__: null,
          promise: void 0,
          resolve: void 0,
          reject: void 0
        }
      };
      transformStreamSetBackpressure(stream, true);
    }
    function transformStreamError(stream, error) {
      const {
        readable
      } = stream[kState];
      const {
        controller
      } = readable[kState];
      readableStreamDefaultControllerError(controller, error);
      transformStreamErrorWritableAndUnblockWrite(stream, error);
    }
    function transformStreamErrorWritableAndUnblockWrite(stream, error) {
      const {
        controller,
        writable
      } = stream[kState];
      transformStreamDefaultControllerClearAlgorithms(controller);
      writableStreamDefaultControllerErrorIfNeeded(
        writable[kState].controller,
        error
      );
      transformStreamUnblockWrite(stream);
    }
    function transformStreamUnblockWrite(stream) {
      if (stream[kState].backpressure)
        transformStreamSetBackpressure(stream, false);
    }
    function transformStreamSetBackpressure(stream, backpressure) {
      assert(stream[kState].backpressure !== backpressure);
      if (stream[kState].backpressureChange.promise !== void 0)
        stream[kState].backpressureChange.resolve?.();
      stream[kState].backpressureChange = PromiseWithResolvers();
      stream[kState].backpressure = backpressure;
    }
    function setupTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm) {
      assert(isTransformStream(stream));
      assert(stream[kState].controller === void 0);
      controller[kState] = {
        __proto__: null,
        stream,
        transformAlgorithm,
        flushAlgorithm,
        cancelAlgorithm
      };
      stream[kState].controller = controller;
    }
    function setupTransformStreamDefaultControllerFromTransformer(stream, transformer) {
      const controller = new TransformStreamDefaultController(kSkipThrow);
      const transform = transformer?.transform;
      const flush = transformer?.flush;
      const cancel = transformer?.cancel;
      const transformAlgorithm = transform ? createPromiseCallback("transformer.transform", transform, transformer) : defaultTransformAlgorithm;
      const flushAlgorithm = flush ? createPromiseCallback("transformer.flush", flush, transformer) : nonOpFlush;
      const cancelAlgorithm = cancel ? createPromiseCallback("transformer.cancel", cancel, transformer) : nonOpCancel;
      setupTransformStreamDefaultController(
        stream,
        controller,
        transformAlgorithm,
        flushAlgorithm,
        cancelAlgorithm
      );
    }
    function transformStreamDefaultControllerClearAlgorithms(controller) {
      controller[kState].transformAlgorithm = void 0;
      controller[kState].flushAlgorithm = void 0;
      controller[kState].cancelAlgorithm = void 0;
    }
    function transformStreamDefaultControllerEnqueue(controller, chunk) {
      const {
        stream
      } = controller[kState];
      const {
        readable
      } = stream[kState];
      const {
        controller: readableController
      } = readable[kState];
      if (!readableStreamDefaultControllerCanCloseOrEnqueue(readableController))
        throw new ERR_INVALID_STATE.TypeError("Unable to enqueue");
      try {
        readableStreamDefaultControllerEnqueue(readableController, chunk);
      } catch (error) {
        transformStreamErrorWritableAndUnblockWrite(stream, error);
        throw readable[kState].storedError;
      }
      const backpressure = readableStreamDefaultControllerHasBackpressure(readableController);
      if (backpressure !== stream[kState].backpressure) {
        assert(backpressure);
        transformStreamSetBackpressure(stream, true);
      }
    }
    function transformStreamDefaultControllerError(controller, error) {
      transformStreamError(controller[kState].stream, error);
    }
    async function transformStreamDefaultControllerPerformTransform(controller, chunk) {
      try {
        return await controller[kState].transformAlgorithm(chunk, controller);
      } catch (error) {
        transformStreamError(controller[kState].stream, error);
        throw error;
      }
    }
    function transformStreamDefaultControllerTerminate(controller) {
      const {
        stream
      } = controller[kState];
      const {
        readable
      } = stream[kState];
      assert(readable !== void 0);
      const {
        controller: readableController
      } = readable[kState];
      readableStreamDefaultControllerClose(readableController);
      transformStreamErrorWritableAndUnblockWrite(
        stream,
        new ERR_INVALID_STATE.TypeError("TransformStream has been terminated")
      );
    }
    function transformStreamDefaultSinkWriteAlgorithm(stream, chunk) {
      const {
        writable,
        controller
      } = stream[kState];
      assert(writable[kState].state === "writable");
      if (stream[kState].backpressure) {
        const backpressureChange = stream[kState].backpressureChange.promise;
        return PromisePrototypeThen(
          backpressureChange,
          () => {
            const {
              writable: writable2
            } = stream[kState];
            if (writable2[kState].state === "erroring")
              throw writable2[kState].storedError;
            assert(writable2[kState].state === "writable");
            return transformStreamDefaultControllerPerformTransform(
              controller,
              chunk
            );
          }
        );
      }
      return transformStreamDefaultControllerPerformTransform(controller, chunk);
    }
    async function transformStreamDefaultSinkAbortAlgorithm(stream, reason) {
      const {
        controller,
        readable
      } = stream[kState];
      if (controller[kState].finishPromise !== void 0) {
        return controller[kState].finishPromise;
      }
      const { promise, resolve, reject } = PromiseWithResolvers();
      controller[kState].finishPromise = promise;
      const cancelPromise = controller[kState].cancelAlgorithm(reason);
      transformStreamDefaultControllerClearAlgorithms(controller);
      PromisePrototypeThen(
        cancelPromise,
        () => {
          if (readable[kState].state === "errored")
            reject(readable[kState].storedError);
          else {
            readableStreamDefaultControllerError(readable[kState].controller, reason);
            resolve();
          }
        },
        (error) => {
          readableStreamDefaultControllerError(readable[kState].controller, error);
          reject(error);
        }
      );
      return controller[kState].finishPromise;
    }
    function transformStreamDefaultSinkCloseAlgorithm(stream) {
      const {
        readable,
        controller
      } = stream[kState];
      if (controller[kState].finishPromise !== void 0) {
        return controller[kState].finishPromise;
      }
      const { promise, resolve, reject } = PromiseWithResolvers();
      controller[kState].finishPromise = promise;
      const flushPromise = controller[kState].flushAlgorithm(controller);
      transformStreamDefaultControllerClearAlgorithms(controller);
      PromisePrototypeThen(
        flushPromise,
        () => {
          if (readable[kState].state === "errored")
            reject(readable[kState].storedError);
          else {
            readableStreamDefaultControllerClose(readable[kState].controller);
            resolve();
          }
        },
        (error) => {
          readableStreamDefaultControllerError(readable[kState].controller, error);
          reject(error);
        }
      );
      return controller[kState].finishPromise;
    }
    function transformStreamDefaultSourcePullAlgorithm(stream) {
      assert(stream[kState].backpressure);
      assert(stream[kState].backpressureChange.promise !== void 0);
      transformStreamSetBackpressure(stream, false);
      return stream[kState].backpressureChange.promise;
    }
    function transformStreamDefaultSourceCancelAlgorithm(stream, reason) {
      const {
        controller,
        writable
      } = stream[kState];
      if (controller[kState].finishPromise !== void 0) {
        return controller[kState].finishPromise;
      }
      const { promise, resolve, reject } = PromiseWithResolvers();
      controller[kState].finishPromise = promise;
      const cancelPromise = controller[kState].cancelAlgorithm(reason);
      transformStreamDefaultControllerClearAlgorithms(controller);
      PromisePrototypeThen(
        cancelPromise,
        () => {
          if (writable[kState].state === "errored")
            reject(writable[kState].storedError);
          else {
            writableStreamDefaultControllerErrorIfNeeded(
              writable[kState].controller,
              reason
            );
            transformStreamUnblockWrite(stream);
            resolve();
          }
        },
        (error) => {
          writableStreamDefaultControllerErrorIfNeeded(
            writable[kState].controller,
            error
          );
          transformStreamUnblockWrite(stream);
          reject(error);
        }
      );
      return controller[kState].finishPromise;
    }
    module.exports = {
      TransformStream,
      TransformStreamDefaultController,
      TransferredTransformStream,
      // Exported Brand Checks
      isTransformStream,
      isTransformStreamDefaultController
    };
  }
});

// ../lib/internal/webstreams/encoding.js
var require_encoding2 = __commonJS({
  "../lib/internal/webstreams/encoding.js"(exports, module) {
    "use strict";
    var {
      ObjectDefineProperties,
      String,
      StringPrototypeCharCodeAt,
      Uint8Array
    } = primordials;
    var {
      TextDecoder,
      TextEncoder
    } = require_encoding();
    var {
      TransformStream
    } = require_transformstream();
    var { customInspect } = require_util();
    var {
      codes: {
        ERR_INVALID_ARG_TYPE,
        ERR_INVALID_THIS
      }
    } = require_errors();
    var {
      customInspectSymbol: kInspect,
      kEmptyObject,
      kEnumerableProperty
    } = require_util2();
    var TextEncoderStream = class {
      #pendingHighSurrogate = null;
      #handle;
      #transform;
      constructor() {
        this.#handle = new TextEncoder();
        this.#transform = new TransformStream({
          transform: (chunk, controller) => {
            chunk = String(chunk);
            let finalChunk = "";
            for (let i = 0; i < chunk.length; i++) {
              const item = chunk[i];
              const codeUnit = StringPrototypeCharCodeAt(item, 0);
              if (this.#pendingHighSurrogate !== null) {
                const highSurrogate = this.#pendingHighSurrogate;
                this.#pendingHighSurrogate = null;
                if (56320 <= codeUnit && codeUnit <= 57343) {
                  finalChunk += highSurrogate + item;
                  continue;
                }
                finalChunk += "\uFFFD";
              }
              if (55296 <= codeUnit && codeUnit <= 56319) {
                this.#pendingHighSurrogate = item;
                continue;
              }
              if (56320 <= codeUnit && codeUnit <= 57343) {
                finalChunk += "\uFFFD";
                continue;
              }
              finalChunk += item;
            }
            if (finalChunk) {
              const value = this.#handle.encode(finalChunk);
              controller.enqueue(value);
            }
          },
          flush: (controller) => {
            if (this.#pendingHighSurrogate !== null) {
              controller.enqueue(new Uint8Array([239, 191, 189]));
            }
          }
        });
      }
      /**
       * @readonly
       * @type {string}
       */
      get encoding() {
        return this.#handle.encoding;
      }
      /**
       * @readonly
       * @type {ReadableStream}
       */
      get readable() {
        return this.#transform.readable;
      }
      /**
       * @readonly
       * @type {WritableStream}
       */
      get writable() {
        return this.#transform.writable;
      }
      [kInspect](depth, options) {
        if (this == null)
          throw new ERR_INVALID_THIS("TextEncoderStream");
        return customInspect(depth, options, "TextEncoderStream", {
          encoding: this.#handle.encoding,
          readable: this.#transform.readable,
          writable: this.#transform.writable
        });
      }
    };
    var TextDecoderStream = class {
      #handle;
      #transform;
      /**
       * @param {string} [encoding]
       * @param {{
       *   fatal? : boolean,
       *   ignoreBOM? : boolean,
       * }} [options]
       */
      constructor(encoding = "utf-8", options = kEmptyObject) {
        this.#handle = new TextDecoder(encoding, options);
        this.#transform = new TransformStream({
          transform: (chunk, controller) => {
            if (chunk === void 0) {
              throw new ERR_INVALID_ARG_TYPE("chunk", "string", chunk);
            }
            const value = this.#handle.decode(chunk, { stream: true });
            if (value)
              controller.enqueue(value);
          },
          flush: (controller) => {
            const value = this.#handle.decode();
            if (value)
              controller.enqueue(value);
            controller.terminate();
          }
        });
      }
      /**
       * @readonly
       * @type {string}
       */
      get encoding() {
        return this.#handle.encoding;
      }
      /**
       * @readonly
       * @type {boolean}
       */
      get fatal() {
        return this.#handle.fatal;
      }
      /**
       * @readonly
       * @type {boolean}
       */
      get ignoreBOM() {
        return this.#handle.ignoreBOM;
      }
      /**
       * @readonly
       * @type {ReadableStream}
       */
      get readable() {
        return this.#transform.readable;
      }
      /**
       * @readonly
       * @type {WritableStream}
       */
      get writable() {
        return this.#transform.writable;
      }
      [kInspect](depth, options) {
        if (this == null)
          throw new ERR_INVALID_THIS("TextDecoderStream");
        return customInspect(depth, options, "TextDecoderStream", {
          encoding: this.#handle.encoding,
          fatal: this.#handle.fatal,
          ignoreBOM: this.#handle.ignoreBOM,
          readable: this.#transform.readable,
          writable: this.#transform.writable
        });
      }
    };
    ObjectDefineProperties(TextEncoderStream.prototype, {
      encoding: kEnumerableProperty,
      readable: kEnumerableProperty,
      writable: kEnumerableProperty
    });
    ObjectDefineProperties(TextDecoderStream.prototype, {
      encoding: kEnumerableProperty,
      fatal: kEnumerableProperty,
      ignoreBOM: kEnumerableProperty,
      readable: kEnumerableProperty,
      writable: kEnumerableProperty
    });
    module.exports = {
      TextEncoderStream,
      TextDecoderStream
    };
  }
});

// ../lib/internal/webstreams/compression.js
var require_compression = __commonJS({
  "../lib/internal/webstreams/compression.js"(exports, module) {
    "use strict";
    var {
      ObjectDefineProperties,
      SymbolToStringTag
    } = primordials;
    var {
      newReadableWritablePairFromDuplex
    } = require_adapters();
    var { customInspect } = require_util();
    var {
      customInspectSymbol: kInspect,
      kEnumerableProperty
    } = require_util2();
    var { createEnumConverter } = require_webidl();
    var zlib;
    function lazyZlib() {
      zlib ??= require_zlib();
      return zlib;
    }
    var formatConverter = createEnumConverter("CompressionFormat", [
      "deflate",
      "deflate-raw",
      "gzip",
      "brotli"
    ]);
    var CompressionStream = class {
      #handle;
      #transform;
      /**
       * @param {'deflate'|'deflate-raw'|'gzip'|'brotli'} format
       */
      constructor(format) {
        format = formatConverter(format, {
          prefix: "Failed to construct 'CompressionStream'",
          context: "1st argument"
        });
        switch (format) {
          case "deflate":
            this.#handle = lazyZlib().createDeflate();
            break;
          case "deflate-raw":
            this.#handle = lazyZlib().createDeflateRaw();
            break;
          case "gzip":
            this.#handle = lazyZlib().createGzip();
            break;
          case "brotli":
            this.#handle = lazyZlib().createBrotliCompress();
            break;
        }
        this.#transform = newReadableWritablePairFromDuplex(this.#handle);
      }
      /**
       * @readonly
       * @type {ReadableStream}
       */
      get readable() {
        return this.#transform.readable;
      }
      /**
       * @readonly
       * @type {WritableStream}
       */
      get writable() {
        return this.#transform.writable;
      }
      [kInspect](depth, options) {
        return customInspect(depth, options, "CompressionStream", {
          readable: this.#transform.readable,
          writable: this.#transform.writable
        });
      }
    };
    var DecompressionStream = class {
      #handle;
      #transform;
      /**
       * @param {'deflate'|'deflate-raw'|'gzip'|'brotli'} format
       */
      constructor(format) {
        format = formatConverter(format, {
          prefix: "Failed to construct 'DecompressionStream'",
          context: "1st argument"
        });
        switch (format) {
          case "deflate":
            this.#handle = lazyZlib().createInflate({
              rejectGarbageAfterEnd: true
            });
            break;
          case "deflate-raw":
            this.#handle = lazyZlib().createInflateRaw();
            break;
          case "gzip":
            this.#handle = lazyZlib().createGunzip({
              rejectGarbageAfterEnd: true
            });
            break;
          case "brotli":
            this.#handle = lazyZlib().createBrotliDecompress();
            break;
        }
        this.#transform = newReadableWritablePairFromDuplex(this.#handle);
        this.#handle.on("error", (err) => {
          if (this.#transform?.writable && !this.#transform.writable.locked && typeof this.#transform.writable.abort === "function") {
            this.#transform.writable.abort(err);
          }
        });
      }
      /**
       * @readonly
       * @type {ReadableStream}
       */
      get readable() {
        return this.#transform.readable;
      }
      /**
       * @readonly
       * @type {WritableStream}
       */
      get writable() {
        return this.#transform.writable;
      }
      [kInspect](depth, options) {
        return customInspect(depth, options, "DecompressionStream", {
          readable: this.#transform.readable,
          writable: this.#transform.writable
        });
      }
    };
    ObjectDefineProperties(CompressionStream.prototype, {
      readable: kEnumerableProperty,
      writable: kEnumerableProperty,
      [SymbolToStringTag]: {
        __proto__: null,
        configurable: true,
        value: "CompressionStream"
      }
    });
    ObjectDefineProperties(DecompressionStream.prototype, {
      readable: kEnumerableProperty,
      writable: kEnumerableProperty,
      [SymbolToStringTag]: {
        __proto__: null,
        configurable: true,
        value: "DecompressionStream"
      }
    });
    module.exports = {
      CompressionStream,
      DecompressionStream
    };
  }
});

// ../lib/stream/web.js
var require_web = __commonJS({
  "../lib/stream/web.js"(exports, module) {
    var {
      TransformStream,
      TransformStreamDefaultController
    } = require_transformstream();
    var {
      WritableStream,
      WritableStreamDefaultController,
      WritableStreamDefaultWriter
    } = require_writablestream();
    var {
      ReadableStream,
      ReadableStreamDefaultReader,
      ReadableStreamBYOBReader,
      ReadableStreamBYOBRequest,
      ReadableByteStreamController,
      ReadableStreamDefaultController
    } = require_readablestream();
    var {
      ByteLengthQueuingStrategy,
      CountQueuingStrategy
    } = require_queuingstrategies();
    var {
      TextEncoderStream,
      TextDecoderStream
    } = require_encoding2();
    var {
      CompressionStream,
      DecompressionStream
    } = require_compression();
    module.exports = {
      ReadableStream,
      ReadableStreamDefaultReader,
      ReadableStreamBYOBReader,
      ReadableStreamBYOBRequest,
      ReadableByteStreamController,
      ReadableStreamDefaultController,
      TransformStream,
      TransformStreamDefaultController,
      WritableStream,
      WritableStreamDefaultWriter,
      WritableStreamDefaultController,
      ByteLengthQueuingStrategy,
      CountQueuingStrategy,
      TextEncoderStream,
      TextDecoderStream,
      CompressionStream,
      DecompressionStream
    };
  }
});
export default require_web();
