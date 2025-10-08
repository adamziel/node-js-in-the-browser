import {
  require_undici
} from "./chunk-F4SYJEY3.js";
import "./chunk-R3FVOHFT.js";
import "./chunk-JEHFPE6G.js";
import "./chunk-BVUF56MI.js";
import "./chunk-4AVSCSZ6.js";
import "./chunk-LX6EKM7T.js";
import "./chunk-YC7P67L4.js";
import {
  __toESM
} from "./chunk-IWXS4Z3P.js";

// to-modularize/fetch-polyfill.js
var import_undici = __toESM(require_undici());
var {
  Request: NodeRequest,
  Response: NodeResponse,
  Headers: NodeHeaders,
  FormData: NodeFormData
} = import_undici.default;
console.log({ NodeRequest });
var browserFetch = window.fetch.bind(window);
function headersToEntries(headers) {
  if (!headers) {
    return [];
  }
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
}
function defineReadonly(target, key, value) {
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: false
    });
  } catch {
  }
}
async function extractBrowserBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return { body: void 0, requiresDuplex: false };
  }
  if (!request.body) {
    return { body: void 0, requiresDuplex: false };
  }
  if (typeof request.body.getReader === "function" && typeof ReadableStream === "function") {
    const reader = request.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            reader.releaseLock?.();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        reader.releaseLock?.();
        return reader.cancel?.(reason);
      }
    });
    return { body: stream, requiresDuplex: true };
  }
  const arrayBuffer = await request.arrayBuffer();
  return { body: arrayBuffer, requiresDuplex: false };
}
function createNodeResponse(response) {
  const responseInit = {
    status: response.status,
    statusText: response.statusText,
    headers: headersToEntries(response.headers)
  };
  const nodeResponse = new NodeResponse(response.body ?? null, responseInit);
  if (typeof response.url === "string") {
    defineReadonly(nodeResponse, "url", response.url);
  }
  if (typeof response.redirected === "boolean") {
    defineReadonly(nodeResponse, "redirected", response.redirected);
  }
  if (typeof response.type === "string") {
    defineReadonly(nodeResponse, "type", response.type);
  }
  return nodeResponse;
}
async function fetch(input, init) {
  const request = input instanceof NodeRequest && init === void 0 ? input : new NodeRequest(input, init);
  const headersEntries = headersToEntries(request.headers);
  const headersInit = headersEntries.length > 0 ? headersEntries : void 0;
  const { body, requiresDuplex } = await extractBrowserBody(request);
  const browserInit = {
    method: request.method,
    signal: request.signal ?? void 0
  };
  if (headersInit) {
    browserInit.headers = headersInit;
  }
  if (body !== void 0) {
    browserInit.body = body;
  }
  if (requiresDuplex && typeof ReadableStream === "function") {
    browserInit.duplex = "half";
  }
  if (request.credentials && request.credentials !== "same-origin") {
    browserInit.credentials = request.credentials;
  }
  if (request.cache && request.cache !== "default") {
    browserInit.cache = request.cache;
  }
  if (request.integrity) {
    browserInit.integrity = request.integrity;
  }
  if (request.keepalive) {
    browserInit.keepalive = request.keepalive;
  }
  if (request.redirect && request.redirect !== "follow") {
    browserInit.redirect = request.redirect;
  }
  if (request.referrer && request.referrer !== "about:client") {
    browserInit.referrer = request.referrer;
  }
  if (request.referrerPolicy && request.referrerPolicy !== "") {
    browserInit.referrerPolicy = request.referrerPolicy;
  }
  if (request.mode && request.mode !== "cors") {
    browserInit.mode = request.mode;
  }
  if (request.priority && request.priority !== "auto") {
    browserInit.priority = request.priority;
  }
  const response = await browserFetch(request.url, browserInit);
  return createNodeResponse(response);
}
var Request = NodeRequest;
var Response = NodeResponse;
var Headers = NodeHeaders;
var FormData = NodeFormData;
var fetch_polyfill_default = fetch;
export {
  FormData,
  Headers,
  Request,
  Response,
  fetch_polyfill_default as default,
  fetch
};
