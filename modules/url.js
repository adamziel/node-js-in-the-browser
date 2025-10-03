import {
  __commonJS
} from "./chunk-2ESYSVXG.js";

// to-modularize/url.js
var require_url = __commonJS({
  "to-modularize/url.js"(exports, module) {
    function urlParse(urlStr, parseQueryString, slashesDenoteHost) {
      if (!urlStr) {
        return null;
      }
      if (typeof urlStr !== "string") {
        throw new TypeError("Parameter 'url' must be a string, not " + typeof urlStr);
      }
      const result = {
        protocol: null,
        slashes: null,
        auth: null,
        host: null,
        port: null,
        hostname: null,
        hash: null,
        search: null,
        query: null,
        pathname: null,
        path: null,
        href: urlStr
      };
      try {
        const parsed = new URL(urlStr);
        result.protocol = parsed.protocol.slice(0, -1);
        result.slashes = true;
        result.host = parsed.host;
        result.hostname = parsed.hostname;
        result.port = parsed.port || null;
        result.pathname = parsed.pathname;
        result.search = parsed.search || null;
        result.hash = parsed.hash || null;
        result.href = parsed.href;
        if (parsed.username || parsed.password) {
          result.auth = parsed.username;
          if (parsed.password) {
            result.auth += ":" + parsed.password;
          }
        }
        if (parseQueryString && result.search) {
          result.query = parseQuery(result.search.slice(1));
        } else if (result.search) {
          result.query = result.search.slice(1);
        }
        result.path = (result.pathname || "") + (result.search || "");
      } catch (e) {
        const hashIndex = urlStr.indexOf("#");
        const queryIndex = urlStr.indexOf("?");
        let path = urlStr;
        if (hashIndex !== -1) {
          result.hash = urlStr.slice(hashIndex);
          path = urlStr.slice(0, hashIndex);
        }
        if (queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)) {
          const searchEnd = hashIndex !== -1 ? hashIndex : urlStr.length;
          result.search = urlStr.slice(queryIndex, searchEnd);
          path = urlStr.slice(0, queryIndex);
          if (parseQueryString) {
            result.query = parseQuery(result.search.slice(1));
          } else {
            result.query = result.search.slice(1);
          }
        }
        result.pathname = path;
        result.path = path + (result.search || "");
      }
      return result;
    }
    function parseQuery(queryStr) {
      const result = {};
      if (!queryStr) return result;
      const pairs = queryStr.split("&");
      for (const pair of pairs) {
        const [key, value] = pair.split("=");
        const decodedKey = decodeURIComponent(key);
        const decodedValue = value ? decodeURIComponent(value) : "";
        result[decodedKey] = decodedValue;
      }
      return result;
    }
    function stringifyQuery(obj) {
      if (!obj || typeof obj !== "object") return "";
      const pairs = [];
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        }
      }
      return pairs.join("&");
    }
    function urlFormat(urlObj) {
      if (typeof urlObj === "string") {
        return urlObj;
      }
      if (!urlObj || typeof urlObj !== "object") {
        return "";
      }
      let result = "";
      if (urlObj.protocol) {
        result += urlObj.protocol;
        if (!urlObj.protocol.endsWith(":")) {
          result += ":";
        }
      }
      if (urlObj.slashes || urlObj.protocol) {
        result += "//";
      }
      if (urlObj.auth) {
        result += urlObj.auth + "@";
      }
      if (urlObj.host) {
        result += urlObj.host;
      } else if (urlObj.hostname) {
        result += urlObj.hostname;
        if (urlObj.port) {
          result += ":" + urlObj.port;
        }
      }
      if (urlObj.pathname) {
        result += urlObj.pathname;
      }
      if (urlObj.search) {
        result += urlObj.search;
      } else if (urlObj.query) {
        const queryStr = typeof urlObj.query === "object" ? stringifyQuery(urlObj.query) : urlObj.query;
        if (queryStr) {
          result += "?" + queryStr;
        }
      }
      if (urlObj.hash) {
        if (!urlObj.hash.startsWith("#")) {
          result += "#";
        }
        result += urlObj.hash;
      }
      return result;
    }
    function urlResolve(from, to) {
      if (!from || !to) {
        return to || from;
      }
      try {
        const resolved = new URL(to, from);
        return resolved.href;
      } catch (e) {
        return to;
      }
    }
    function urlResolveObject(from, to) {
      const resolvedUrl = urlResolve(from, to);
      return urlParse(resolvedUrl, false, true);
    }
    module.exports = {
      Url: window.URL,
      URL: window.URL,
      parse: urlParse,
      resolve: urlResolve,
      resolveObject: urlResolveObject,
      format: urlFormat
    };
  }
});
export default require_url();
