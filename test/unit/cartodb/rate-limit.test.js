require('../../support/test_helper');

const assert = require('assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const {
    rateLimitMiddleware,
    RATE_LIMIT_ENDPOINTS_GROUPS,
    getStoreKey
} = require('../../../lib/cartodb/middleware/rate-limit');

let redisClient;
let rateLimit;
const user = 'cdb';
let keysToDelete = [];

function setLimit(count, period, burst) {
    redisClient.SELECT(8, function (err) {
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

describe('rate limit unit 1 limit', function () {
    before(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = true;

        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({ pool: redisPool });
        rateLimit = rateLimitMiddleware(metadataBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ENDPOINT_8);

        redisClient = redis.createClient(global.environment.redis.port);

        const count = 1;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = false;

        keysToDelete.forEach(key => {
            redisClient.del(key);
        });
    });

    it("should not be rate limited", function (done) {
        const { req, res } = getReqAndRes();
        rateLimit(req, res, function (err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": 1,
                "X-Rate-Limit-Remaining": 0,
                "X-Rate-Limit-Reset": 1,
                "X-Rate-Limit-Retry-After": -1
            });

            setTimeout(done, 1000);
        });
    });

    it("3 request (1 per second) should not be rate limited", function (done) {
        let { req, res } = getReqAndRes();
        rateLimit(req, res, function (err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": 1,
                "X-Rate-Limit-Remaining": 0,
                "X-Rate-Limit-Reset": 1,
                "X-Rate-Limit-Retry-After": -1
            });
        });

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": -1
                    });
                });
            },
            1100
        );

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": -1
                    });

                    setTimeout(done, 1000);
                });
            },
            2 * 1100
        );
    });

    it("5 request (1 per 250ms) should be limited: OK, KO, KO, KO, OK", function (done) {
        let { req, res } = getReqAndRes();
        rateLimit(req, res, function (err) {
            assert.ifError(err);
            assert.deepEqual(res.headers, {
                "X-Rate-Limit-Limit": 1,
                "X-Rate-Limit-Remaining": 0,
                "X-Rate-Limit-Reset": 1,
                "X-Rate-Limit-Retry-After": -1
            });
        });

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": -1
                    });
                });
            },
            250
        );

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            500
        );

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            750
        );

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": 1
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
                });
            },
            950
        );

        setTimeout(
            function () {
                let { req, res } = getReqAndRes();
                rateLimit(req, res, function (err) {
                    assert.ifError(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 1,
                        "X-Rate-Limit-Retry-After": -1
                    });
                    setTimeout(done, 1000);
                });
            },
            1050
        );
    });
});


describe.only('rate limit unit multiple limits', function () {
    before(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = true;

        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({ pool: redisPool });
        rateLimit = rateLimitMiddleware(metadataBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ENDPOINT_8);

        redisClient = redis.createClient(global.environment.redis.port);
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = false;

        keysToDelete.forEach(key => {
            redisClient.del(key);
        });
    });

    it("get the smaller limit 1", function (done) {
        setLimit(5, 1, 5);
        setLimit(2, 1, 2);
        setTimeout( () => {
            let { req, res } = getReqAndRes();
            rateLimit(req, res, function (err) {
                assert.ifError(err);
                assert.deepEqual(res.headers, {
                    "X-Rate-Limit-Limit": 3,
                    "X-Rate-Limit-Remaining": 1,
                    "X-Rate-Limit-Reset": 0,
                    "X-Rate-Limit-Retry-After": -1
                });

                keysToDelete.forEach(key => {
                    redisClient.del(key);
                });

                setTimeout(done, 1000);
            });
        }, 100);

    });

    it("get the smaller limit 2", function (done) {
        setLimit(2, 1, 2);
        setLimit(5, 2, 5);
        setTimeout( () => {
            let { req, res } = getReqAndRes();
            rateLimit(req, res, function (err) {
                assert.ifError(err);
                assert.deepEqual(res.headers, {
                    "X-Rate-Limit-Limit": 3,
                    "X-Rate-Limit-Remaining": 2,
                    "X-Rate-Limit-Reset": 0,
                    "X-Rate-Limit-Retry-After": -1
                });
                done();
            });
        }, 100);

    });

});
