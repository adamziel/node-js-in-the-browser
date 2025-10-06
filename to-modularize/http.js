module.exports = require('stream-http');
module.exports.ours = true;
const originalRequest = module.exports.request;
module.exports.request = function () {
  const result = originalRequest(...arguments)
  result.abort = result.destroy = function() {
    console.log("Abort")
  }
  console.log("result", result)
  return result;
}