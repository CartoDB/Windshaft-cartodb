var _ = require('underscore');


require(__dirname + '/test_helper');

module.exports = function(opts) {

    var config = {
        redis_pool: {
            max: 10, 
            idleTimeoutMillis: 1, 
            reapIntervalMillis: 1,
            port: global.environment.redis.port
        }
    }

    _.extend(config,  opts || {});

    return config;
}();

