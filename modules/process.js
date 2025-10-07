import {
  __commonJS
} from "./chunk-IWXS4Z3P.js";

// to-modularize/process.js
var require_process = __commonJS({
  "to-modularize/process.js"(exports, module) {
    var term = null;
    function setTerminal(terminal) {
      term = terminal;
    }
    var sharedDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : void 0;
    var argc = 0;
    var argv = [];
    var env = {};
    var execPath = "/bin/node";
    var exit = (code) => {
      let message = "";
      if (code instanceof Error) {
        message = code.message;
      } else {
        message = `process.exit(${code ?? 0}) called code ${code ?? 0}`;
      }
      emit("exit", code ?? 0);
      console.log(message);
      self.close();
    };
    var abort = () => {
      console.error("process.abort() called - aborting execution");
      throw new Error("Process aborted");
    };
    var currentDirectory = "/bin";
    function chdir(directory) {
      currentDirectory = directory;
    }
    var cwd = () => {
      return currentDirectory;
    };
    var getuid = () => {
      return 1e3;
    };
    var getgid = () => {
      return 1e3;
    };
    var getgroups = () => {
      return [1e3];
    };
    var umask = (mask) => {
      const currentMask = 18;
      return mask !== void 0 ? currentMask : currentMask;
    };
    var uptime = () => {
      return performance.now() / 1e3;
    };
    var hrtime = (time) => {
      const now = performance.now();
      const seconds = Math.floor(now / 1e3);
      const nanoseconds = Math.floor(now % 1e3 * 1e6);
      if (time) {
        const diffSeconds = seconds - time[0];
        const diffNanoseconds = nanoseconds - time[1];
        return [diffSeconds, diffNanoseconds];
      }
      return [seconds, nanoseconds];
    };
    var memoryUsage = () => {
      return {
        rss: 50 * 1024 * 1024,
        // 50MB
        heapTotal: 30 * 1024 * 1024,
        // 30MB
        heapUsed: 20 * 1024 * 1024,
        // 20MB
        external: 5 * 1024 * 1024,
        // 5MB
        arrayBuffers: 1 * 1024 * 1024
        // 1MB
      };
    };
    var cpuUsage = (previousValue) => {
      const mockUsage = { user: 1e5, system: 5e4 };
      if (previousValue) {
        return {
          user: mockUsage.user - previousValue.user,
          system: mockUsage.system - previousValue.system
        };
      }
      return mockUsage;
    };
    var kill = (pid, signal) => {
      console.warn(
        `process.kill(${pid}, ${signal}) called - not supported in browser environment`
      );
      return true;
    };
    var eventListeners = /* @__PURE__ */ new Map();
    var on = (event, listener) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push(listener);
      if (event === "exit") {
        globalThis.addEventListener("beforeunload", () => {
          const listeners = eventListeners.get("exit") || [];
          listeners.forEach((listener2) => {
            try {
              listener2(0);
            } catch (e) {
              console.error("Error in exit listener:", e);
            }
          });
        });
      } else if (event === "uncaughtException") {
        globalThis.addEventListener("error", (errorEvent) => {
          const listeners = eventListeners.get("uncaughtException") || [];
          listeners.forEach((listener2) => {
            try {
              listener2(errorEvent.error || new Error(errorEvent.message));
            } catch (e) {
              console.error("Error in uncaughtException listener:", e);
            }
          });
        });
      } else if (event === "unhandledRejection") {
        globalThis.addEventListener("unhandledrejection", (rejectionEvent) => {
          const listeners = eventListeners.get("unhandledRejection") || [];
          listeners.forEach((listener2) => {
            try {
              listener2(rejectionEvent.reason, rejectionEvent.promise);
            } catch (e) {
              console.error("Error in unhandledRejection listener:", e);
            }
          });
        });
      }
      return globalThis.process;
    };
    var off = (event, listener) => {
      const listeners = eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
      return globalThis.process;
    };
    var removeListener = off;
    var emit = (event, ...args) => {
      const listeners = eventListeners.get(event) || [];
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (e) {
          console.error(`Error in ${event} listener:`, e);
        }
      });
      return listeners.length > 0;
    };
    var nextTick = (fn, ...args) => {
      setTimeout(fn.bind(null, ...args), 0);
    };
    var version = "20.17.0";
    var versions = {
      arch: "x64",
      version: "20.17.0",
      platform: "darwin",
      release: {
        name: "node",
        sourceUrl: "https://nodejs.org/download/release/v20.17.0/",
        headersUrl: "https://nodejs.org/download/release/v20.17.0/headers.tar.gz",
        libUrl: "https://nodejs.org/download/release/v20.17.0/lib.tar.gz"
      },
      modules: "node:buffer",
      node: "20.17.0",
      openssl: "3.3.2",
      uv: "1.46.0",
      v8: "11.7.50.18",
      zlib: "1.3.0",
      libc: "glibc",
      libcxx: "libcxx",
      libcxxabi: "libcxxabi",
      libunwind: "libunwind",
      libatomic: "libatomic",
      libuv: "1.46.0",
      libvips: "8.14.2",
      libjpeg: "2.1.4",
      libpng: "1.6.39",
      libtiff: "4.5.0",
      libwebp: "1.3.2",
      libgif: "5.2.1",
      libavif: "0.13.0",
      libexif: "0.6.24",
      libheif: "1.16.2",
      libopenjpeg: "2.5.0",
      libraw: "0.21.1",
      libheif: "1.16.2",
      libopenjpeg: "2.5.0",
      libraw: "0.21.1"
    };
    on("output.standard", (data) => {
      globalThis.process.stdout.write(data);
    });
    var getMaxListeners = () => {
      return 50;
    };
    var features = {
      openssl_is_boringssl: false
    };
    var initProcess = ({
      args,
      cwd: cwd2,
      stdin,
      stdout,
      stderr
    }) => {
      module.exports.argv = [...args];
      module.exports.argc = args.length;
      module.exports.stdout = stdout;
      module.exports.stderr = stderr;
      module.exports.stdin = stdin;
      module.exports.stdin.setEncoding("utf-8");
      module.exports.stdin.resume();
      currentDirectory = cwd2;
    };
    module.exports = {
      setTerminal,
      initProcess,
      argc,
      argv,
      env,
      nextTick,
      version,
      versions,
      execPath,
      exit,
      features,
      abort,
      chdir,
      cwd,
      getuid,
      getgid,
      getgroups,
      umask,
      uptime,
      hrtime,
      memoryUsage,
      cpuUsage,
      kill,
      on,
      off,
      removeListener,
      emit,
      getMaxListeners
    };
  }
});
export default require_process();
