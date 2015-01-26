var request = require('request');

function VarnishHttpCacheBackend(host, port) {
    this.host = host;
    this.port = port;
}

module.exports = VarnishHttpCacheBackend;

/**
 * @param cacheObject should respond to `key() -> String` method
 * @param {Function} callback
 */
VarnishHttpCacheBackend.prototype.invalidate = function(cacheObject, callback) {
    request(
        {
            method: 'PURGE',
            url: 'http://' + this.host + ':' + this.port + '/key',
            headers: {
                'Invalidation-Match': '\\b' + cacheObject.key() + '\\b'
            }
        },
        function(err, response) {
            if (err || response.statusCode !== 204) {
                return callback(new Error('Unable to invalidate Varnish object'));
            }
            return callback(null);
        }
    );
};

module.exports = VarnishHttpCacheBackend;