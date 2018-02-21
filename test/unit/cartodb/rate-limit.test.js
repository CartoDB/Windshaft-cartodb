require('../../support/test_helper');

const assert = require('assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const {
    rateLimitMiddleware,
    RATE_LIMIT_ENDPOINTS_GROUPS,
    getStoreKey
} =  require('../../../lib/cartodb/middleware/rate-limit');

let redisClient;
let rateLimit;
const user = 'cdb';
let keysToDelete = [];

function setLimit(count, period, burst) {
    redisClient.SELECT(8, function(err) {
        if (err) {
            return;
        }

        const key = getStoreKey(user, RATE_LIMIT_ENDPOINTS_GROUPS.ENDPOINT_8);
        redisClient.hset(key, 'b', burst, 'c', count, 'p', period, function() {
            keysToDelete.push(key);
        });
    });
}

function getReqAndRes() {
    return {
        req: {},
        res: {
            headers: {},
            set(headers) {
                this.headers = headers;
            }
        }
    };
}

describe('rate limit unit', function() {
    before(function() {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = true;
        
        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({pool: redisPool});
        rateLimit = rateLimitMiddleware(metadataBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ENDPOINT_8);
        
        redisClient = redis.createClient(global.environment.redis.port);
    });

    after(function() {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = false;
        
        keysToDelete.forEach( key => {
            redisClient.del(key);
        });
    });
    
    it("should not be rate limited", function(done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        const {req, res} = getReqAndRes();
        rateLimit(req, res, function(err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": burst + 1,
                "X-Rate-Limit-Remaining": burst,
                "X-Rate-Limit-Reset": period,
                "X-Rate-Limit-Retry-After": -1
            });

            setTimeout(done, period * 1000);
        });
    });

    it("1 req/sec: 3 request (1 per second) should not be rate limited", function(done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        let {req, res} = getReqAndRes();
        rateLimit(req, res, function(err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": burst + 1,
                "X-Rate-Limit-Remaining": burst,
                "X-Rate-Limit-Reset": period,
                "X-Rate-Limit-Retry-After": -1
            });
        });

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": burst,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": -1
                    });                
                });
            },
            period * 1050
        );

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": burst,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": -1
                    });
                    
                    setTimeout(done, period * 1000);
                });
            },
            2 * period * 1050
        );
    });

    it("1 req/sec: 5 request (1 per 250ms) should be limited: OK, KO, KO, KO, OK", function(done) {
        const count = 1;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);

        let {req, res} = getReqAndRes();
        rateLimit(req, res, function(err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": burst + 1,
                "X-Rate-Limit-Remaining": count - 1,
                "X-Rate-Limit-Reset": period,
                "X-Rate-Limit-Retry-After": -1
            });
        });

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": count - 1,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": -1
                    });                  
                });
            },
            250
        );

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            500
        );

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            750
        );

        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            950
        );
        
        setTimeout(
            function() {
                let {req, res} = getReqAndRes();
                rateLimit(req, res, function(err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": burst + 1,
                        "X-Rate-Limit-Remaining": count - 1,
                        "X-Rate-Limit-Reset": period,
                        "X-Rate-Limit-Retry-After": -1
                    });                  
                    setTimeout(done, 1000);
                });
            },
            1050
        );
    });

    // skipped: not always limits the same requests
    // created to test the behavior of redis-cell 
    it.skip("2 req/sec: 10 request (1 per 100ms) should be: 1 not limited, 4 limited", function(done) {
        const count = 2;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);

        function doRequest(delay, notLimited) {
            setTimeout(
                function() {
                    let {req, res} = getReqAndRes();
                    rateLimit(req, res, function(err) {
                        assert.equal(!!!err, notLimited);
                    });
                },
                delay
            );
        }

        // 2 left (1 more every 500ms)
        doRequest(100, true); // 1 left
        doRequest(200, true); // 0 left
        doRequest(300, true); // 0 left (+1)
        doRequest(400, false);
        doRequest(500, false);
        doRequest(600, false);
        doRequest(700, true); // (+1)
        doRequest(800, false);
        doRequest(900, false);
        doRequest(1000, false);
        doRequest(1100, false);
        doRequest(1200, true);
        doRequest(1300, false);
        doRequest(1400, false);
        doRequest(1500, false);
        doRequest(1600, false);
        doRequest(1700, true);
        doRequest(1800, false);
        doRequest(1900, false);
        doRequest(2000, false);
        doRequest(2100, false);
        doRequest(2200, true);
        doRequest(2300, false);
        doRequest(2400, false);
        doRequest(2500, false);
        doRequest(2600, false);
        doRequest(2700, true);
        doRequest(2800, false);
        doRequest(2900, false);
        doRequest(3000, false);
        doRequest(3100, false);
        doRequest(3200, true);
        doRequest(3300, false);

        setTimeout(done, 3400);
    });

    // skipped: not always limits the same requests
    // created to test the behavior of redis-cell 
    it.skip("5 req/sec: 10 request (1 per 100ms) should be: 1 not limited, 1 limited", function(done) {
        const count = 5;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);

        function doRequest(delay, notLimited) {
            setTimeout(
                function() {
                    let {req, res} = getReqAndRes();
                    rateLimit(req, res, function(err) {
                        assert.equal(!!!err, notLimited);
                    });
                },
                delay
            );
        }

        // 5 left
        doRequest(100, true); // 4 left
        doRequest(200, true); // 4 left (+1)
        doRequest(300, true); // 3 left
        doRequest(400, true); // 3 left (+1)
        doRequest(500, true); // 2 left
        doRequest(600, true); // 2 left (+1)
        doRequest(700, true); // 1 left
        doRequest(800, true); // 1 left (+1)
        doRequest(900, true); // 0 left
        doRequest(1000, true); // 0 left (+1)
        doRequest(1100, false);
        doRequest(1200, true);
        doRequest(1300, false);
        doRequest(1400, true);
        doRequest(1500, false);
        doRequest(1600, true);
        doRequest(1700, false);
        doRequest(1800, true);
        doRequest(1900, false);
        doRequest(2000, true);
        doRequest(2100, false);
        doRequest(2200, true);
        doRequest(2300, false);
        doRequest(2400, true);
        doRequest(2500, false);
        doRequest(2600, true);
        doRequest(2700, false);
        doRequest(2800, true);
        doRequest(2900, false);
        doRequest(3000, true);
        doRequest(3100, false);
        doRequest(3200, true);
        doRequest(3300, false);

        setTimeout(done, 3400);
    });

});
