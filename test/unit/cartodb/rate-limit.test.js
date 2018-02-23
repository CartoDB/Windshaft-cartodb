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
        redisClient.rpush(key, burst);
        redisClient.rpush(key, count);
        redisClient.rpush(key, period);
        keysToDelete.push(key);
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



});
