import {
  require_errors,
  require_querystring,
  require_querystring2,
  require_url,
  require_util3 as require_util,
  require_validators
} from "./chunk-UA6LXRJC.js";
import {
  require_constants
} from "./chunk-UYUMXBC2.js";
import "./chunk-QGV5XKCM.js";
import "./chunk-MPGL2DXN.js";
import {
  __commonJS
} from "./chunk-2ESYSVXG.js";

// ../lib/url.js
var require_url2 = __commonJS({
  "../lib/url.js"(exports, module) {
    var {
      ArrayPrototypeJoin,
      Boolean,
      Int8Array,
      ObjectAssign,
      ObjectKeys,
      StringPrototypeAt,
      StringPrototypeCharCodeAt,
      StringPrototypeIndexOf,
      StringPrototypeReplaceAll,
      StringPrototypeSlice,
      decodeURIComponent
    } = primordials;
    var { URLPattern } = internalBinding("url_pattern");
    var { toASCII } = internalBinding("encoding_binding");
    var { encodeStr, hexTable } = require_querystring();
    var querystring = require_querystring2();
    var {
      ERR_INVALID_ARG_TYPE,
      ERR_INVALID_URL,
      ERR_INVALID_ARG_VALUE
    } = require_errors().codes;
    var {
      validateString,
      validateObject
    } = require_validators();
    var { spliceOne } = require_util();
    var { isInsideNodeModules } = internalBinding("util");
    var {
      URL,
      URLSearchParams,
      domainToASCII,
      domainToUnicode,
      fileURLToPath,
      fileURLToPathBuffer,
      pathToFileURL: _pathToFileURL,
      urlToHttpOptions,
      unsafeProtocol,
      hostlessProtocol,
      slashedProtocol
    } = require_url();
    var bindingUrl = internalBinding("url");
    function Url() {
      this.protocol = null;
      this.slashes = null;
      this.auth = null;
      this.host = null;
      this.port = null;
      this.hostname = null;
      this.hash = null;
      this.search = null;
      this.query = null;
      this.pathname = null;
      this.path = null;
      this.href = null;
    }
    var protocolPattern = /^[a-z0-9.+-]+:/i;
    var portPattern = /:[0-9]*$/;
    var hostPattern = /^\/\/[^@/]+@[^@/]+/;
    var simplePathPattern = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;
    var hostnameMaxLen = 255;
    var {
      CHAR_SPACE,
      CHAR_TAB,
      CHAR_CARRIAGE_RETURN,
      CHAR_LINE_FEED,
      CHAR_NO_BREAK_SPACE,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE,
      CHAR_HASH,
      CHAR_FORWARD_SLASH,
      CHAR_LEFT_SQUARE_BRACKET,
      CHAR_RIGHT_SQUARE_BRACKET,
      CHAR_LEFT_ANGLE_BRACKET,
      CHAR_RIGHT_ANGLE_BRACKET,
      CHAR_LEFT_CURLY_BRACKET,
      CHAR_RIGHT_CURLY_BRACKET,
      CHAR_QUESTION_MARK,
      CHAR_DOUBLE_QUOTE,
      CHAR_SINGLE_QUOTE,
      CHAR_PERCENT,
      CHAR_SEMICOLON,
      CHAR_BACKWARD_SLASH,
      CHAR_CIRCUMFLEX_ACCENT,
      CHAR_GRAVE_ACCENT,
      CHAR_VERTICAL_LINE,
      CHAR_AT,
      CHAR_COLON
    } = require_constants();
    var urlParseWarned = false;
    function urlParse(url, parseQueryString, slashesDenoteHost) {
      if (!urlParseWarned && !isInsideNodeModules(100, true)) {
        urlParseWarned = true;
        globalThis.process.emitWarning(
          "`url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.",
          "DeprecationWarning",
          "DEP0169"
        );
      }
      if (url instanceof Url) return url;
      const urlObject = new Url();
      urlObject.parse(url, parseQueryString, slashesDenoteHost);
      return urlObject;
    }
    function isIpv6Hostname(hostname) {
      return StringPrototypeCharCodeAt(hostname, 0) === CHAR_LEFT_SQUARE_BRACKET && StringPrototypeCharCodeAt(hostname, hostname.length - 1) === CHAR_RIGHT_SQUARE_BRACKET;
    }
    var forbiddenHostChars = /[\0\t\n\r #%/:<>?@[\\\]^|]/;
    var forbiddenHostCharsIpv6 = /[\0\t\n\r #%/<>?@\\^|]/;
    Url.prototype.parse = function parse(url, parseQueryString, slashesDenoteHost) {
      validateString(url, "url");
      let hasHash = false;
      let hasAt = false;
      let start = -1;
      let end = -1;
      let rest = "";
      let lastPos = 0;
      for (let i = 0, inWs = false, split = false; i < url.length; ++i) {
        const code = url.charCodeAt(i);
        const isWs = code < 33 || code === CHAR_NO_BREAK_SPACE || code === CHAR_ZERO_WIDTH_NOBREAK_SPACE;
        if (start === -1) {
          if (isWs)
            continue;
          lastPos = start = i;
        } else if (inWs) {
          if (!isWs) {
            end = -1;
            inWs = false;
          }
        } else if (isWs) {
          end = i;
          inWs = true;
        }
        if (!split) {
          switch (code) {
            case CHAR_AT:
              hasAt = true;
              break;
            case CHAR_HASH:
              hasHash = true;
            // Fall through
            case CHAR_QUESTION_MARK:
              split = true;
              break;
            case CHAR_BACKWARD_SLASH:
              if (i - lastPos > 0)
                rest += url.slice(lastPos, i);
              rest += "/";
              lastPos = i + 1;
              break;
          }
        } else if (!hasHash && code === CHAR_HASH) {
          hasHash = true;
        }
      }
      if (start !== -1) {
        if (lastPos === start) {
          if (end === -1) {
            if (start === 0)
              rest = url;
            else
              rest = url.slice(start);
          } else {
            rest = url.slice(start, end);
          }
        } else if (end === -1 && lastPos < url.length) {
          rest += url.slice(lastPos);
        } else if (end !== -1 && lastPos < end) {
          rest += url.slice(lastPos, end);
        }
      }
      if (!slashesDenoteHost && !hasHash && !hasAt) {
        const simplePath = simplePathPattern.exec(rest);
        if (simplePath) {
          this.path = rest;
          this.href = rest;
          this.pathname = simplePath[1];
          if (simplePath[2]) {
            this.search = simplePath[2];
            if (parseQueryString) {
              this.query = querystring.parse(this.search.slice(1));
            } else {
              this.query = this.search.slice(1);
            }
          } else if (parseQueryString) {
            this.search = null;
            this.query = { __proto__: null };
          }
          return this;
        }
      }
      let proto = protocolPattern.exec(rest);
      let lowerProto;
      if (proto) {
        proto = proto[0];
        lowerProto = proto.toLowerCase();
        this.protocol = lowerProto;
        rest = rest.slice(proto.length);
      }
      let slashes;
      if (slashesDenoteHost || proto || hostPattern.test(rest)) {
        slashes = rest.charCodeAt(0) === CHAR_FORWARD_SLASH && rest.charCodeAt(1) === CHAR_FORWARD_SLASH;
        if (slashes && !(proto && hostlessProtocol.has(lowerProto))) {
          rest = rest.slice(2);
          this.slashes = true;
        }
      }
      if (!hostlessProtocol.has(lowerProto) && (slashes || proto && !slashedProtocol.has(proto))) {
        let hostEnd = -1;
        let atSign = -1;
        let nonHost = -1;
        for (let i = 0; i < rest.length; ++i) {
          switch (rest.charCodeAt(i)) {
            case CHAR_TAB:
            case CHAR_LINE_FEED:
            case CHAR_CARRIAGE_RETURN:
              rest = rest.slice(0, i) + rest.slice(i + 1);
              i -= 1;
              break;
            case CHAR_SPACE:
            case CHAR_DOUBLE_QUOTE:
            case CHAR_PERCENT:
            case CHAR_SINGLE_QUOTE:
            case CHAR_SEMICOLON:
            case CHAR_LEFT_ANGLE_BRACKET:
            case CHAR_RIGHT_ANGLE_BRACKET:
            case CHAR_BACKWARD_SLASH:
            case CHAR_CIRCUMFLEX_ACCENT:
            case CHAR_GRAVE_ACCENT:
            case CHAR_LEFT_CURLY_BRACKET:
            case CHAR_VERTICAL_LINE:
            case CHAR_RIGHT_CURLY_BRACKET:
              if (nonHost === -1)
                nonHost = i;
              break;
            case CHAR_HASH:
            case CHAR_FORWARD_SLASH:
            case CHAR_QUESTION_MARK:
              if (nonHost === -1)
                nonHost = i;
              hostEnd = i;
              break;
            case CHAR_AT:
              atSign = i;
              nonHost = -1;
              break;
          }
          if (hostEnd !== -1)
            break;
        }
        start = 0;
        if (atSign !== -1) {
          this.auth = decodeURIComponent(rest.slice(0, atSign));
          start = atSign + 1;
        }
        if (nonHost === -1) {
          this.host = rest.slice(start);
          rest = "";
        } else {
          this.host = rest.slice(start, nonHost);
          rest = rest.slice(nonHost);
        }
        this.parseHost();
        if (typeof this.hostname !== "string")
          this.hostname = "";
        const hostname = this.hostname;
        const ipv6Hostname = isIpv6Hostname(hostname);
        if (!ipv6Hostname) {
          rest = getHostname(this, rest, hostname, url);
        }
        if (this.hostname.length > hostnameMaxLen) {
          this.hostname = "";
        } else {
          this.hostname = this.hostname.toLowerCase();
        }
        if (this.hostname !== "") {
          if (ipv6Hostname) {
            if (forbiddenHostCharsIpv6.test(this.hostname)) {
              throw new ERR_INVALID_URL(url);
            }
          } else {
            this.hostname = toASCII(this.hostname);
            if (this.hostname === "" || forbiddenHostChars.test(this.hostname)) {
              throw new ERR_INVALID_URL(url);
            }
          }
        }
        const p = this.port ? ":" + this.port : "";
        const h = this.hostname || "";
        this.host = h + p;
        if (ipv6Hostname) {
          this.hostname = this.hostname.slice(1, -1);
          if (rest[0] !== "/") {
            rest = "/" + rest;
          }
        }
      }
      if (!unsafeProtocol.has(lowerProto)) {
        rest = autoEscapeStr(rest);
      }
      let questionIdx = -1;
      let hashIdx = -1;
      for (let i = 0; i < rest.length; ++i) {
        const code = rest.charCodeAt(i);
        if (code === CHAR_HASH) {
          this.hash = rest.slice(i);
          hashIdx = i;
          break;
        } else if (code === CHAR_QUESTION_MARK && questionIdx === -1) {
          questionIdx = i;
        }
      }
      if (questionIdx !== -1) {
        if (hashIdx === -1) {
          this.search = rest.slice(questionIdx);
          this.query = rest.slice(questionIdx + 1);
        } else {
          this.search = rest.slice(questionIdx, hashIdx);
          this.query = rest.slice(questionIdx + 1, hashIdx);
        }
        if (parseQueryString) {
          this.query = querystring.parse(this.query);
        }
      } else if (parseQueryString) {
        this.search = null;
        this.query = { __proto__: null };
      }
      const useQuestionIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx);
      const firstIdx = useQuestionIdx ? questionIdx : hashIdx;
      if (firstIdx === -1) {
        if (rest.length > 0)
          this.pathname = rest;
      } else if (firstIdx > 0) {
        this.pathname = rest.slice(0, firstIdx);
      }
      if (slashedProtocol.has(lowerProto) && this.hostname && !this.pathname) {
        this.pathname = "/";
      }
      if (this.pathname || this.search) {
        const p = this.pathname || "";
        const s = this.search || "";
        this.path = p + s;
      }
      this.href = this.format();
      return this;
    };
    function getHostname(self, rest, hostname, url) {
      for (let i = 0; i < hostname.length; ++i) {
        const code = hostname.charCodeAt(i);
        const isValid = code !== CHAR_FORWARD_SLASH && code !== CHAR_BACKWARD_SLASH && code !== CHAR_HASH && code !== CHAR_QUESTION_MARK && code !== CHAR_COLON;
        if (!isValid) {
          if (code === CHAR_COLON) {
            throw new ERR_INVALID_ARG_VALUE("url", "Invalid port in url", url);
          }
          self.hostname = hostname.slice(0, i);
          return `/${hostname.slice(i)}${rest}`;
        }
      }
      return rest;
    }
    var escapedCodes = [
      /* 0 - 9 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "%09",
      /* 10 - 19 */
      "%0A",
      "",
      "",
      "%0D",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 20 - 29 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 30 - 39 */
      "",
      "",
      "%20",
      "",
      "%22",
      "",
      "",
      "",
      "",
      "%27",
      /* 40 - 49 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 50 - 59 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 60 - 69 */
      "%3C",
      "",
      "%3E",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 70 - 79 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 80 - 89 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 90 - 99 */
      "",
      "",
      "%5C",
      "",
      "%5E",
      "",
      "%60",
      "",
      "",
      "",
      /* 100 - 109 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 110 - 119 */
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      /* 120 - 125 */
      "",
      "",
      "",
      "%7B",
      "%7C",
      "%7D"
    ];
    function autoEscapeStr(rest) {
      let escaped = "";
      let lastEscapedPos = 0;
      for (let i = 0; i < rest.length; ++i) {
        const escapedChar = escapedCodes[rest.charCodeAt(i)];
        if (escapedChar) {
          if (i > lastEscapedPos)
            escaped += rest.slice(lastEscapedPos, i);
          escaped += escapedChar;
          lastEscapedPos = i + 1;
        }
      }
      if (lastEscapedPos === 0)
        return rest;
      if (lastEscapedPos < rest.length)
        escaped += rest.slice(lastEscapedPos);
      return escaped;
    }
    function urlFormat(urlObject, options) {
      if (typeof urlObject === "string") {
        urlObject = urlParse(urlObject);
      } else if (typeof urlObject !== "object" || urlObject === null) {
        throw new ERR_INVALID_ARG_TYPE(
          "urlObject",
          ["Object", "string"],
          urlObject
        );
      } else if (urlObject instanceof URL) {
        let fragment = true;
        let unicode = false;
        let search = true;
        let auth = true;
        if (options) {
          validateObject(options, "options");
          if (options.fragment != null) {
            fragment = Boolean(options.fragment);
          }
          if (options.unicode != null) {
            unicode = Boolean(options.unicode);
          }
          if (options.search != null) {
            search = Boolean(options.search);
          }
          if (options.auth != null) {
            auth = Boolean(options.auth);
          }
        }
        return bindingUrl.format(urlObject.href, fragment, unicode, search, auth);
      }
      return Url.prototype.format.call(urlObject);
    }
    var noEscapeAuth = new Int8Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0x00 - 0x0F
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0x10 - 0x1F
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      // 0x20 - 0x2F
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      // 0x30 - 0x3F
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 0x40 - 0x4F
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      1,
      // 0x50 - 0x5F
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 0x60 - 0x6F
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      0
      // 0x70 - 0x7F
    ]);
    Url.prototype.format = function format() {
      let auth = this.auth || "";
      if (auth) {
        auth = encodeStr(auth, noEscapeAuth, hexTable);
        auth += "@";
      }
      let protocol = this.protocol || "";
      if (protocol && StringPrototypeCharCodeAt(protocol, protocol.length - 1) !== 58) {
        protocol += ":";
      }
      let pathname = this.pathname || "";
      let hash = this.hash || "";
      let host = "";
      let query = "";
      if (this.host) {
        host = auth + this.host;
      } else if (this.hostname) {
        host = auth + (StringPrototypeIndexOf(this.hostname, ":") !== -1 && !isIpv6Hostname(this.hostname) ? "[" + this.hostname + "]" : this.hostname);
        if (this.port) {
          host += ":" + this.port;
        }
      }
      if (this.query !== null && typeof this.query === "object") {
        query = querystring.stringify(this.query);
      }
      let search = this.search || query && "?" + query || "";
      if (StringPrototypeIndexOf(pathname, "#") !== -1 || StringPrototypeIndexOf(pathname, "?") !== -1) {
        let newPathname = "";
        let lastPos = 0;
        const len = pathname.length;
        for (let i = 0; i < len; i++) {
          const code = StringPrototypeCharCodeAt(pathname, i);
          if (code === CHAR_HASH || code === CHAR_QUESTION_MARK) {
            if (i > lastPos) {
              newPathname += StringPrototypeSlice(pathname, lastPos, i);
            }
            newPathname += code === CHAR_HASH ? "%23" : "%3F";
            lastPos = i + 1;
          }
        }
        if (lastPos < len) {
          newPathname += StringPrototypeSlice(pathname, lastPos);
        }
        pathname = newPathname;
      }
      if (this.slashes || slashedProtocol.has(protocol)) {
        if (this.slashes || host) {
          if (pathname && StringPrototypeCharCodeAt(pathname, 0) !== CHAR_FORWARD_SLASH)
            pathname = "/" + pathname;
          host = "//" + host;
        } else if (protocol.length >= 4 && StringPrototypeCharCodeAt(protocol, 0) === 102 && StringPrototypeCharCodeAt(protocol, 1) === 105 && StringPrototypeCharCodeAt(protocol, 2) === 108 && StringPrototypeCharCodeAt(protocol, 3) === 101) {
          host = "//";
        }
      }
      if (StringPrototypeIndexOf(search, "#") !== -1) {
        search = StringPrototypeReplaceAll(search, "#", "%23");
      }
      if (hash && StringPrototypeCharCodeAt(hash, 0) !== CHAR_HASH) {
        hash = "#" + hash;
      }
      if (search && StringPrototypeCharCodeAt(search, 0) !== CHAR_QUESTION_MARK) {
        search = "?" + search;
      }
      return protocol + host + pathname + search + hash;
    };
    function urlResolve(source, relative) {
      return urlParse(source, false, true).resolve(relative);
    }
    Url.prototype.resolve = function resolve(relative) {
      return this.resolveObject(urlParse(relative, false, true)).format();
    };
    function urlResolveObject(source, relative) {
      if (!source) return relative;
      return urlParse(source, false, true).resolveObject(relative);
    }
    Url.prototype.resolveObject = function resolveObject(relative) {
      if (typeof relative === "string") {
        const rel = new Url();
        rel.parse(relative, false, true);
        relative = rel;
      }
      const result = new Url();
      ObjectAssign(result, this);
      result.hash = relative.hash;
      if (relative.href === "") {
        result.href = result.format();
        return result;
      }
      if (relative.slashes && !relative.protocol) {
        const relativeWithoutProtocol = ObjectKeys(relative).reduce((acc, key) => {
          if (key !== "protocol") {
            acc[key] = relative[key];
          }
          return acc;
        }, {});
        ObjectAssign(result, relativeWithoutProtocol);
        if (slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) {
          result.path = result.pathname = "/";
        }
        result.href = result.format();
        return result;
      }
      if (relative.protocol && relative.protocol !== result.protocol) {
        if (!slashedProtocol.has(relative.protocol)) {
          ObjectAssign(result, relative);
          result.href = result.format();
          return result;
        }
        result.protocol = relative.protocol;
        if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol.has(relative.protocol)) {
          const relPath2 = (relative.pathname || "").split("/");
          while (relPath2.length && !(relative.host = relPath2.shift())) ;
          relative.host ||= "";
          relative.hostname ||= "";
          if (relPath2[0] !== "") relPath2.unshift("");
          if (relPath2.length < 2) relPath2.unshift("");
          result.pathname = relPath2.join("/");
        } else {
          result.pathname = relative.pathname;
        }
        result.search = relative.search;
        result.query = relative.query;
        result.host = relative.host || "";
        result.auth = relative.auth;
        result.hostname = relative.hostname || relative.host;
        result.port = relative.port;
        if (result.pathname || result.search) {
          const p = result.pathname || "";
          const s = result.search || "";
          result.path = p + s;
        }
        result.slashes ||= relative.slashes;
        result.href = result.format();
        return result;
      }
      const isSourceAbs = result.pathname && result.pathname.charAt(0) === "/";
      const isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === "/";
      let mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
      const removeAllDots = mustEndAbs;
      let srcPath = result.pathname && result.pathname.split("/") || [];
      const relPath = relative.pathname && relative.pathname.split("/") || [];
      const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);
      if (noLeadingSlashes) {
        result.hostname = "";
        result.port = null;
        if (result.host) {
          if (srcPath[0] === "") srcPath[0] = result.host;
          else srcPath.unshift(result.host);
        }
        result.host = "";
        if (relative.protocol) {
          relative.hostname = null;
          relative.port = null;
          result.auth = null;
          if (relative.host) {
            if (relPath[0] === "") relPath[0] = relative.host;
            else relPath.unshift(relative.host);
          }
          relative.host = null;
        }
        mustEndAbs &&= relPath[0] === "" || srcPath[0] === "";
      }
      if (isRelAbs) {
        if (relative.host || relative.host === "") {
          if (result.host !== relative.host) result.auth = null;
          result.host = relative.host;
          result.port = relative.port;
        }
        if (relative.hostname || relative.hostname === "") {
          if (result.hostname !== relative.hostname) result.auth = null;
          result.hostname = relative.hostname;
        }
        result.search = relative.search;
        result.query = relative.query;
        srcPath = relPath;
      } else if (relPath.length) {
        srcPath ||= [];
        srcPath.pop();
        srcPath = srcPath.concat(relPath);
        result.search = relative.search;
        result.query = relative.query;
      } else if (relative.search !== null && relative.search !== void 0) {
        if (noLeadingSlashes) {
          result.hostname = result.host = srcPath.shift();
          const authInHost = result.host && result.host.indexOf("@") > 0 && result.host.split("@");
          if (authInHost) {
            result.auth = authInHost.shift();
            result.host = result.hostname = authInHost.shift();
          }
        }
        result.search = relative.search;
        result.query = relative.query;
        if (result.pathname !== null || result.search !== null) {
          result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
        }
        result.href = result.format();
        return result;
      }
      if (!srcPath.length) {
        result.pathname = null;
        if (result.search) {
          result.path = "/" + result.search;
        } else {
          result.path = null;
        }
        result.href = result.format();
        return result;
      }
      let last = srcPath[srcPath.length - 1];
      const hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === "." || last === "..") || last === "";
      let up = 0;
      for (let i = srcPath.length - 1; i >= 0; i--) {
        last = srcPath[i];
        if (last === ".") {
          spliceOne(srcPath, i);
        } else if (last === "..") {
          spliceOne(srcPath, i);
          up++;
        } else if (up) {
          spliceOne(srcPath, i);
          up--;
        }
      }
      if (!mustEndAbs && !removeAllDots) {
        while (up--) {
          srcPath.unshift("..");
        }
      }
      if (mustEndAbs && srcPath[0] !== "" && (!srcPath[0] || srcPath[0].charAt(0) !== "/")) {
        srcPath.unshift("");
      }
      if (hasTrailingSlash && StringPrototypeAt(ArrayPrototypeJoin(srcPath, "/"), -1) !== "/") {
        srcPath.push("");
      }
      const isAbsolute = srcPath[0] === "" || srcPath[0] && srcPath[0].charAt(0) === "/";
      if (noLeadingSlashes) {
        result.hostname = result.host = isAbsolute ? "" : srcPath.length ? srcPath.shift() : "";
        const authInHost = result.host && result.host.indexOf("@") > 0 ? result.host.split("@") : false;
        if (authInHost) {
          result.auth = authInHost.shift();
          result.host = result.hostname = authInHost.shift();
        }
      }
      mustEndAbs ||= result.host && srcPath.length;
      if (mustEndAbs && !isAbsolute) {
        srcPath.unshift("");
      }
      if (!srcPath.length) {
        result.pathname = null;
        result.path = null;
      } else {
        result.pathname = srcPath.join("/");
      }
      if (result.pathname !== null || result.search !== null) {
        result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
      }
      result.auth = relative.auth || result.auth;
      result.slashes ||= relative.slashes;
      result.href = result.format();
      return result;
    };
    Url.prototype.parseHost = function parseHost() {
      let host = this.host;
      let port = portPattern.exec(host);
      if (port) {
        port = port[0];
        if (port !== ":") {
          this.port = port.slice(1);
        }
        host = host.slice(0, host.length - port.length);
      }
      if (host) this.hostname = host;
    };
    function pathToFileURL(path, options) {
      validateString(path, "path");
      return _pathToFileURL(path, options);
    }
    module.exports = {
      // Original API
      Url,
      parse: urlParse,
      resolve: urlResolve,
      resolveObject: urlResolveObject,
      format: urlFormat,
      // WHATWG API
      URL,
      URLPattern,
      URLSearchParams,
      domainToASCII,
      domainToUnicode,
      // Utilities
      pathToFileURL,
      fileURLToPath,
      fileURLToPathBuffer,
      urlToHttpOptions
    };
  }
});
export default require_url2();
