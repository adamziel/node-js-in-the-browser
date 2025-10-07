module.exports = require('stream-http');
module.exports.ours = true;
const originalRequest = module.exports.request;
module.exports.request = function () {
  const result = originalRequest(...arguments)

  /**
   * Somewhere among our fetch->http->streams->fetch polyfills,
   * the outgoing request gets aborted. The upstream intention seems
   * to be clearing the stream after finishing, but in reality it is
   * just cancelling every outbound request.
   * 
   * @TODO: Get to the bottom of this and fix it. There's likely something
   *        wrong with our syscalls / internal bindings.
   */
  result.abort = result.destroy = function() {
    // console.log("Abort")
  }
  // console.log("result", result)
  return result;
}