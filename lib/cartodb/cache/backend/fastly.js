var FastlyPurge = require('fastly-purge');

function FastlyCacheBackend(apiKey, serviceId, softPurge) {
    this.serviceId = serviceId;
    this.fastlyPurge = new FastlyPurge(apiKey, { softPurge: softPurge || true });
}

module.exports = FastlyCacheBackend;

/**
 * @param cacheObject should respond to `key() -> String` method
 * @param {Function} callback
 */
FastlyCacheBackend.prototype.invalidate = function(cacheObject, callback) {
    this.fastlyPurge.key(this.serviceId, cacheObject.key(), callback);
};
