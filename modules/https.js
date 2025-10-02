import {
  require_assert,
  require_debuglog,
  require_errors,
  require_http,
  require_http_agent,
  require_http_client,
  require_http_server,
  require_net,
  require_net2,
  require_options,
  require_tls,
  require_url,
  require_util3 as require_util,
  require_validators
} from "./chunk-UG7WRN5Z.js";
import {
  __commonJS
} from "./chunk-EKOWL7XK.js";

// ../lib/https.js
var require_https = __commonJS({
  "../lib/https.js"(exports, module) {
    var {
      ArrayPrototypeIndexOf,
      ArrayPrototypePush,
      ArrayPrototypeShift,
      ArrayPrototypeSplice,
      ArrayPrototypeUnshift,
      FunctionPrototypeCall,
      JSONStringify,
      NumberParseInt,
      ObjectAssign,
      ObjectSetPrototypeOf,
      ReflectApply,
      ReflectConstruct,
      SymbolAsyncDispose
    } = primordials;
    var {
      assertCrypto,
      kEmptyObject,
      promisify,
      once
    } = require_util();
    var { ERR_PROXY_TUNNEL } = require_errors().codes;
    assertCrypto();
    var tls = require_tls();
    var {
      kProxyConfig,
      checkShouldUseProxy,
      filterEnvForProxies,
      kWaitForProxyTunnel
    } = require_http();
    var { Agent: HttpAgent } = require_http_agent();
    var {
      httpServerPreClose,
      Server: HttpServer,
      setupConnectionsTracking,
      storeHTTPOptions,
      _connectionListener
    } = require_http_server();
    var { ClientRequest } = require_http_client();
    var debug = require_debuglog().debuglog("https", (fn) => {
      debug = fn;
    });
    var net = require_net2();
    var { URL, urlToHttpOptions, isURL } = require_url();
    var { validateObject } = require_validators();
    var { isIP } = require_net();
    var assert = require_assert();
    var { getOptionValue } = require_options();
    function Server(opts, requestListener) {
      if (!(this instanceof Server)) return new Server(opts, requestListener);
      let ALPNProtocols = ["http/1.1"];
      if (typeof opts === "function") {
        requestListener = opts;
        opts = kEmptyObject;
      } else if (opts == null) {
        opts = kEmptyObject;
      } else {
        validateObject(opts, "options");
        if (opts.ALPNProtocols || opts.ALPNCallback)
          ALPNProtocols = void 0;
      }
      FunctionPrototypeCall(storeHTTPOptions, this, opts);
      FunctionPrototypeCall(
        tls.Server,
        this,
        {
          noDelay: true,
          ALPNProtocols,
          ...opts
        },
        _connectionListener
      );
      this.httpAllowHalfOpen = false;
      if (requestListener) {
        this.addListener("request", requestListener);
      }
      this.addListener("tlsClientError", function addListener(err, conn) {
        if (!this.emit("clientError", err, conn))
          conn.destroy(err);
      });
      this.timeout = 0;
      this.maxHeadersCount = null;
      this.on("listening", setupConnectionsTracking);
    }
    ObjectSetPrototypeOf(Server.prototype, tls.Server.prototype);
    ObjectSetPrototypeOf(Server, tls.Server);
    Server.prototype.closeAllConnections = HttpServer.prototype.closeAllConnections;
    Server.prototype.closeIdleConnections = HttpServer.prototype.closeIdleConnections;
    Server.prototype.setTimeout = HttpServer.prototype.setTimeout;
    Server.prototype.close = function close() {
      httpServerPreClose(this);
      ReflectApply(tls.Server.prototype.close, this, arguments);
      return this;
    };
    Server.prototype[SymbolAsyncDispose] = async function() {
      await FunctionPrototypeCall(promisify(this.close), this);
    };
    function createServer(opts, requestListener) {
      return new Server(opts, requestListener);
    }
    function getTunnelConfigForProxiedHttps(agent, reqOptions) {
      if (!agent[kProxyConfig]) {
        return null;
      }
      if ((reqOptions.protocol || agent.protocol) !== "https:") {
        return null;
      }
      const shouldUseProxy = checkShouldUseProxy(agent[kProxyConfig], reqOptions);
      debug(`getTunnelConfigForProxiedHttps should use proxy for ${reqOptions.host}:${reqOptions.port}:`, shouldUseProxy);
      if (!shouldUseProxy) {
        return null;
      }
      const { auth, href } = agent[kProxyConfig];
      const ipType = isIP(reqOptions.host);
      const requestHost = ipType === 6 ? `[${reqOptions.host}]` : reqOptions.host;
      const requestPort = reqOptions.port || agent.defaultPort;
      const endpoint = `${requestHost}:${requestPort}`;
      assert(!endpoint.includes("\r"));
      assert(!endpoint.includes("\n"));
      let payload = `CONNECT ${endpoint} HTTP/1.1\r
`;
      if (auth) {
        payload += `proxy-authorization: ${auth}\r
`;
      }
      if (agent.keepAlive || agent.maxSockets !== Infinity) {
        payload += "proxy-connection: keep-alive\r\n";
      }
      payload += `host: ${endpoint}`;
      payload += "\r\n\r\n";
      const result = {
        __proto__: null,
        proxyTunnelPayload: payload,
        requestOptions: {
          // Options used for the request sent after the tunnel is established.
          __proto__: null,
          servername: reqOptions.servername || ipType ? void 0 : reqOptions.host,
          ...reqOptions
        }
      };
      debug(`updated request for HTTPS proxy ${href} with`, result);
      return result;
    }
    function establishTunnel(agent, socket, options, tunnelConfig, afterSocket) {
      const { proxyTunnelPayload } = tunnelConfig;
      function read() {
        let chunk;
        while ((chunk = socket.read()) !== null) {
          if (onProxyData(chunk) !== -1) {
            break;
          }
        }
        socket.on("readable", read);
      }
      function cleanup() {
        socket.removeListener("end", onProxyEnd);
        socket.removeListener("error", onProxyError);
        socket.removeListener("readable", read);
        socket.setTimeout(0);
      }
      function onProxyError(err) {
        debug("onProxyError", err);
        cleanup();
        afterSocket(err, socket);
      }
      let buffer = "";
      function onProxyData(chunk) {
        const str = chunk.toString();
        debug("onProxyData", str);
        buffer += str;
        const headerEndIndex = buffer.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) return headerEndIndex;
        const statusLine = buffer.substring(0, buffer.indexOf("\r\n"));
        const statusCode = statusLine.split(" ")[1];
        if (statusCode !== "200") {
          debug(`onProxyData receives ${statusCode}, cleaning up`);
          cleanup();
          const targetHost = proxyTunnelPayload.split("\r")[0].split(" ")[1];
          const message = `Failed to establish tunnel to ${targetHost} via ${agent[kProxyConfig].href}: ${statusLine}`;
          const err = new ERR_PROXY_TUNNEL(message);
          err.statusCode = NumberParseInt(statusCode);
          afterSocket(err, socket);
        } else {
          debug("onProxyData receives 200, establishing tunnel");
          cleanup();
          const { requestOptions } = tunnelConfig;
          tunnelConfig.requestOptions = null;
          requestOptions.socket = socket;
          let tunneldSocket;
          const onTLSHandshakeError = (err) => {
            debug("Propagate error event from tunneled socket to tunnel socket");
            afterSocket(err, tunneldSocket);
          };
          tunneldSocket = tls.connect(requestOptions, () => {
            debug("TLS handshake over tunnel succeeded");
            tunneldSocket.removeListener("error", onTLSHandshakeError);
            afterSocket(null, tunneldSocket);
          });
          tunneldSocket.on("free", () => {
            debug("Propagate free event from tunneled socket to tunnel socket");
            socket.emit("free");
          });
          tunneldSocket.on("error", onTLSHandshakeError);
        }
        return headerEndIndex;
      }
      function onProxyEnd() {
        cleanup();
        const err = new ERR_PROXY_TUNNEL("Connection to establish proxy tunnel ended unexpectedly");
        afterSocket(err, socket);
      }
      const proxyTunnelTimeout = tunnelConfig.requestOptions.timeout;
      debug("proxyTunnelTimeout", proxyTunnelTimeout, options.timeout);
      function onProxyTimeout() {
        debug("onProxyTimeout", proxyTunnelTimeout);
        cleanup();
        const err = new ERR_PROXY_TUNNEL(`Connection to establish proxy tunnel timed out after ${proxyTunnelTimeout}ms`);
        err.proxyTunnelTimeout = proxyTunnelTimeout;
        afterSocket(err, socket);
      }
      if (proxyTunnelTimeout && proxyTunnelTimeout > 0) {
        debug("proxy tunnel setTimeout", proxyTunnelTimeout);
        socket.setTimeout(proxyTunnelTimeout, onProxyTimeout);
      }
      socket.on("error", onProxyError);
      socket.on("end", onProxyEnd);
      socket.write(proxyTunnelPayload);
      read();
    }
    function createConnection(...args) {
      let options, cb;
      if (args[0] !== null && typeof args[0] === "object") {
        options = args[0];
      } else if (args[1] !== null && typeof args[1] === "object") {
        options = { ...args[1] };
      } else if (args[2] === null || typeof args[2] !== "object") {
        options = {};
      } else {
        options = { ...args[2] };
      }
      if (typeof args[0] === "number") {
        options.port = args[0];
      }
      if (typeof args[1] === "string") {
        options.host = args[1];
      }
      if (typeof args[args.length - 1] === "function") {
        cb = args[args.length - 1];
      }
      debug("createConnection", options);
      if (options._agentKey) {
        const session = this._getSession(options._agentKey);
        if (session) {
          debug("reuse session for %j", options._agentKey);
          options = {
            session,
            ...options
          };
        }
      }
      let socket;
      const tunnelConfig = getTunnelConfigForProxiedHttps(this, options);
      debug(`https createConnection should use proxy for ${options.host}:${options.port}:`, tunnelConfig);
      if (!tunnelConfig) {
        socket = tls.connect(options);
      } else {
        const connectOptions = {
          ...this[kProxyConfig].proxyConnectionOptions
        };
        debug("Create proxy socket", connectOptions);
        const onError = (err) => {
          cleanupAndPropagate(err, socket);
        };
        const proxyTunnelTimeout = tunnelConfig.requestOptions.timeout;
        const onTimeout = () => {
          const err = new ERR_PROXY_TUNNEL(`Connection to establish proxy tunnel timed out after ${proxyTunnelTimeout}ms`);
          err.proxyTunnelTimeout = proxyTunnelTimeout;
          cleanupAndPropagate(err, socket);
        };
        const cleanupAndPropagate = once((err, currentSocket) => {
          debug("cleanupAndPropagate", err);
          socket.removeListener("error", onError);
          socket.removeListener("timeout", onTimeout);
          if (err && err.code === "ERR_PROXY_TUNNEL" && !err.statusCode) {
            socket.destroy();
          }
          if (cb) {
            cb(err, currentSocket);
          }
        });
        const onProxyConnection = () => {
          socket.removeListener("error", onError);
          establishTunnel(this, socket, options, tunnelConfig, cleanupAndPropagate);
        };
        if (this[kProxyConfig].protocol === "http:") {
          socket = net.connect(connectOptions, onProxyConnection);
        } else {
          socket = tls.connect(connectOptions, onProxyConnection);
        }
        socket.on("error", onError);
        if (proxyTunnelTimeout) {
          socket.setTimeout(proxyTunnelTimeout, onTimeout);
        }
        socket[kWaitForProxyTunnel] = true;
      }
      if (options._agentKey) {
        socket.on("session", (session) => {
          this._cacheSession(options._agentKey, session);
        });
        socket.once("close", (err) => {
          if (err)
            this._evictSession(options._agentKey);
        });
      }
      return socket;
    }
    function Agent(options) {
      if (!(this instanceof Agent))
        return new Agent(options);
      options = { __proto__: null, ...options };
      options.defaultPort ??= 443;
      options.protocol ??= "https:";
      FunctionPrototypeCall(HttpAgent, this, options);
      this.maxCachedSessions = this.options.maxCachedSessions;
      if (this.maxCachedSessions === void 0)
        this.maxCachedSessions = 100;
      this._sessionCache = {
        map: {},
        list: []
      };
    }
    ObjectSetPrototypeOf(Agent.prototype, HttpAgent.prototype);
    ObjectSetPrototypeOf(Agent, HttpAgent);
    Agent.prototype.createConnection = createConnection;
    Agent.prototype.getName = function getName(options = kEmptyObject) {
      let name = FunctionPrototypeCall(HttpAgent.prototype.getName, this, options);
      name += ":";
      if (options.ca)
        name += options.ca;
      name += ":";
      if (options.cert)
        name += options.cert;
      name += ":";
      if (options.clientCertEngine)
        name += options.clientCertEngine;
      name += ":";
      if (options.ciphers)
        name += options.ciphers;
      name += ":";
      if (options.key)
        name += options.key;
      name += ":";
      if (options.pfx)
        name += options.pfx;
      name += ":";
      if (options.rejectUnauthorized !== void 0)
        name += options.rejectUnauthorized;
      name += ":";
      if (options.servername && options.servername !== options.host)
        name += options.servername;
      name += ":";
      if (options.minVersion)
        name += options.minVersion;
      name += ":";
      if (options.maxVersion)
        name += options.maxVersion;
      name += ":";
      if (options.secureProtocol)
        name += options.secureProtocol;
      name += ":";
      if (options.crl)
        name += options.crl;
      name += ":";
      if (options.honorCipherOrder !== void 0)
        name += options.honorCipherOrder;
      name += ":";
      if (options.ecdhCurve)
        name += options.ecdhCurve;
      name += ":";
      if (options.dhparam)
        name += options.dhparam;
      name += ":";
      if (options.secureOptions !== void 0)
        name += options.secureOptions;
      name += ":";
      if (options.sessionIdContext)
        name += options.sessionIdContext;
      name += ":";
      if (options.sigalgs)
        name += JSONStringify(options.sigalgs);
      name += ":";
      if (options.privateKeyIdentifier)
        name += options.privateKeyIdentifier;
      name += ":";
      if (options.privateKeyEngine)
        name += options.privateKeyEngine;
      return name;
    };
    Agent.prototype._getSession = function _getSession(key) {
      return this._sessionCache.map[key];
    };
    Agent.prototype._cacheSession = function _cacheSession(key, session) {
      if (this.maxCachedSessions === 0)
        return;
      if (this._sessionCache.map[key]) {
        this._sessionCache.map[key] = session;
        return;
      }
      if (this._sessionCache.list.length >= this.maxCachedSessions) {
        const oldKey = ArrayPrototypeShift(this._sessionCache.list);
        debug("evicting %j", oldKey);
        delete this._sessionCache.map[oldKey];
      }
      ArrayPrototypePush(this._sessionCache.list, key);
      this._sessionCache.map[key] = session;
    };
    Agent.prototype._evictSession = function _evictSession(key) {
      const index = ArrayPrototypeIndexOf(this._sessionCache.list, key);
      if (index === -1)
        return;
      ArrayPrototypeSplice(this._sessionCache.list, index, 1);
      delete this._sessionCache.map[key];
    };
    var globalAgent = new Agent({
      keepAlive: true,
      scheduling: "lifo",
      timeout: 5e3,
      // This normalized from both --use-env-proxy and NODE_USE_ENV_PROXY settings.
      proxyEnv: getOptionValue("--use-env-proxy") ? filterEnvForProxies(globalThis.process.env) : void 0
    });
    function request(...args) {
      let options = {};
      if (typeof args[0] === "string") {
        const urlStr = ArrayPrototypeShift(args);
        options = urlToHttpOptions(new URL(urlStr));
      } else if (isURL(args[0])) {
        options = urlToHttpOptions(ArrayPrototypeShift(args));
      }
      if (args[0] && typeof args[0] !== "function") {
        ObjectAssign(options, ArrayPrototypeShift(args));
      }
      options._defaultAgent = module.exports.globalAgent;
      ArrayPrototypeUnshift(args, options);
      return ReflectConstruct(ClientRequest, args);
    }
    function get(input, options, cb) {
      const req = request(input, options, cb);
      req.end();
      return req;
    }
    module.exports = {
      Agent,
      globalAgent,
      Server,
      createServer,
      get,
      request
    };
  }
});
export default require_https();
