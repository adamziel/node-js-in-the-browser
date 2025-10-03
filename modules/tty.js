import {
  require_readline
} from "./chunk-XC5B3CIZ.js";
import "./chunk-A7ZOR4M2.js";
import {
  require_errors,
  require_net2 as require_net,
  require_tty
} from "./chunk-6IAZD3U5.js";
import "./chunk-3AM4K3TZ.js";
import "./chunk-MSO2SOE4.js";
import "./chunk-YXQLIKKQ.js";
import {
  __commonJS
} from "./chunk-GI5RMYH6.js";

// ../lib/tty.js
var require_tty2 = __commonJS({
  "../lib/tty.js"(exports, module) {
    var {
      NumberIsInteger,
      ObjectSetPrototypeOf
    } = primordials;
    var net = require_net();
    var { TTY, isTTY } = internalBinding("tty_wrap");
    var {
      ErrnoException,
      codes: {
        ERR_INVALID_FD,
        ERR_TTY_INIT_FAILED
      }
    } = require_errors();
    var {
      getColorDepth,
      hasColors
    } = require_tty();
    var readline;
    function isatty(fd) {
      return NumberIsInteger(fd) && fd >= 0 && fd <= 2147483647 && isTTY(fd);
    }
    function ReadStream(fd, options) {
      if (!(this instanceof ReadStream))
        return new ReadStream(fd, options);
      if (fd >> 0 !== fd || fd < 0)
        throw new ERR_INVALID_FD(fd);
      const ctx = {};
      const tty = new TTY(fd, ctx);
      if (ctx.code !== void 0) {
        throw new ERR_TTY_INIT_FAILED(ctx);
      }
      net.Socket.call(this, {
        readableHighWaterMark: 0,
        handle: tty,
        manualStart: true,
        ...options
      });
      this.isRaw = false;
      this.isTTY = true;
    }
    ObjectSetPrototypeOf(ReadStream.prototype, net.Socket.prototype);
    ObjectSetPrototypeOf(ReadStream, net.Socket);
    ReadStream.prototype.setRawMode = function(flag) {
      flag = !!flag;
      const err = this._handle?.setRawMode(flag);
      if (err) {
        this.emit("error", new ErrnoException(err, "setRawMode"));
        return this;
      }
      this.isRaw = flag;
      return this;
    };
    function WriteStream(fd) {
      if (!(this instanceof WriteStream))
        return new WriteStream(fd);
      if (fd >> 0 !== fd || fd < 0)
        throw new ERR_INVALID_FD(fd);
      const ctx = {};
      const tty = new TTY(fd, ctx);
      if (ctx.code !== void 0) {
        throw new ERR_TTY_INIT_FAILED(ctx);
      }
      net.Socket.call(this, {
        readableHighWaterMark: 0,
        handle: tty,
        manualStart: true
      });
      this._handle.setBlocking(true);
      const winSize = [0, 0];
      const err = this._handle.getWindowSize(winSize);
      if (!err) {
        this.columns = winSize[0];
        this.rows = winSize[1];
      }
    }
    ObjectSetPrototypeOf(WriteStream.prototype, net.Socket.prototype);
    ObjectSetPrototypeOf(WriteStream, net.Socket);
    WriteStream.prototype.isTTY = true;
    WriteStream.prototype.getColorDepth = getColorDepth;
    WriteStream.prototype.hasColors = hasColors;
    WriteStream.prototype._refreshSize = function() {
      const oldCols = this.columns;
      const oldRows = this.rows;
      const winSize = [0, 0];
      const err = this._handle.getWindowSize(winSize);
      if (err) {
        this.emit("error", new ErrnoException(err, "getWindowSize"));
        return;
      }
      const { 0: newCols, 1: newRows } = winSize;
      if (oldCols !== newCols || oldRows !== newRows) {
        this.columns = newCols;
        this.rows = newRows;
        this.emit("resize");
      }
    };
    WriteStream.prototype.cursorTo = function(x, y, callback) {
      if (readline === void 0) readline = require_readline();
      return readline.cursorTo(this, x, y, callback);
    };
    WriteStream.prototype.moveCursor = function(dx, dy, callback) {
      if (readline === void 0) readline = require_readline();
      return readline.moveCursor(this, dx, dy, callback);
    };
    WriteStream.prototype.clearLine = function(dir, callback) {
      if (readline === void 0) readline = require_readline();
      return readline.clearLine(this, dir, callback);
    };
    WriteStream.prototype.clearScreenDown = function(callback) {
      if (readline === void 0) readline = require_readline();
      return readline.clearScreenDown(this, callback);
    };
    WriteStream.prototype.getWindowSize = function() {
      return [this.columns, this.rows];
    };
    module.exports = { isatty, ReadStream, WriteStream };
  }
});
export default require_tty2();
