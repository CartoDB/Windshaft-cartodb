var FastlyPurge = require('fastly-purge');

function FastlyCacheBackend(apiKey, serviceId) {
    this.serviceId = serviceId;
    this.fastlyPurge = new FastlyPurge(apiKey, { softPurge: false });
}

module.exports = FastlyCacheBackend;

/**
 * @param cacheObject should respond to `key() -> String` method
 * @param {Function} callback
 */
FastlyCacheBackend.prototype.invalidate = function(cacheObject, callback) {
    this.fastlyPurge.key(this.serviceId, cacheObject.key(), callback);
};
