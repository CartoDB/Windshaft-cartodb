/**
 * @param cacheBackend should respond to `invalidate(cacheObject, callback)` method
 * @constructor
 */
function SurrogateKeysCache(cacheBackend) {
    this.cacheBackend = cacheBackend;
}

module.exports = SurrogateKeysCache;


/**
 * @param response should respond to `header(key, value)` method
 * @param cacheObject should respond to `key() -> String` method
 */
SurrogateKeysCache.prototype.tag = function(response, cacheObject) {
    response.header('Surrogate-Key', cacheObject.key());
};

/**
 * @param cacheObject should respond to `key() -> String` method
 * @param {Function} callback
 */
SurrogateKeysCache.prototype.invalidate = function(cacheObject, callback) {
    this.cacheBackend.invalidate(cacheObject, callback);
};
