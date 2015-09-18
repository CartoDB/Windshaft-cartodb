var queue = require('queue-async');

/**
 * @param {Array|Object} cacheBackends each backend backend should respond to `invalidate(cacheObject, callback)` method
 * @constructor
 */
function SurrogateKeysCache(cacheBackends) {
    this.cacheBackends = Array.isArray(cacheBackends) ? cacheBackends : [cacheBackends];
}

module.exports = SurrogateKeysCache;


/**
 * @param response should respond to `header(key, value)` method
 * @param cacheObject should respond to `key() -> String` method
 */
SurrogateKeysCache.prototype.tag = function(response, cacheObject) {
    var newKey = cacheObject.key();
    response.set('Surrogate-Key', appendSurrogateKey(
        response.get('Surrogate-Key'),
        Array.isArray(newKey) ? cacheObject.key().join(' ') : newKey
    ));

};

function appendSurrogateKey(currentKey, newKey) {
    if (!!currentKey) {
        newKey = currentKey + ' ' + newKey;
    }
    return newKey;
}

/**
 * @param cacheObject should respond to `key() -> String` method
 * @param {Function} callback
 */
SurrogateKeysCache.prototype.invalidate = function(cacheObject, callback) {
    var invalidationQueue = queue(this.cacheBackends.length);

    this.cacheBackends.forEach(function(cacheBackend) {
        invalidationQueue.defer(function(cacheBackend, done) {
            cacheBackend.invalidate(cacheObject, done);
        }, cacheBackend);
    });

    invalidationQueue.awaitAll(function(err, result) {
        if (err) {
            return callback(err);
        }
        callback(null, result);
    });
};
