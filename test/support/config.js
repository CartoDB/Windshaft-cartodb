var _ = require('underscore');

module.exports = function(opts) {

    var config = {
        redis_pool: {
            max: 10, 
            idleTimeoutMillis: 1, 
            reapIntervalMillis: 1,
            port: 6333 // TODO: read from test env ?
        }
    }

    _.extend(config,  opts || {});

    return config;
}();

