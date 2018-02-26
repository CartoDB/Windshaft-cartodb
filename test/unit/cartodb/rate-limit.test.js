require('../../support/test_helper');

const assert = require('assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const {
    rateLimitMiddleware,
    RATE_LIMIT_ENDPOINTS_GROUPS,
    getStoreKey,
    getLowerRateLimit
} = require('../../../lib/cartodb/middleware/rate-limit');

let redisClient;
let rateLimit;
const user = 'localhost';
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


describe('Lower rate limit', function () {
    it("1 limit: not limited", function (done) {
        const limits = [[0, 3, 1, -1, 1]];
        const result = getLowerRateLimit(limits);
        assert.deepEqual(limits[0], result);
        done();
    });

    it("1 limit: limited", function (done) {
        const limits = [[1, 3, 0, 0, 1]];
        const result = getLowerRateLimit(limits);
        assert.deepEqual(limits[0], result);
        done();
    });

    it("empty or invalid", function (done) {
        let limits = [];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = undefined;
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = null;
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[]];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[], []];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = {};
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [{}];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        limits = [[1, 2]];
        result = getLowerRateLimit(limits);
        assert.deepEqual(null, result);

        done();
    });

    it("multiple limits: valid and invalid", function (done) {
        const limit1 = [0, 3, 0];
        const limit2 = [0, 3, 1, 0, 1];
        
        let limits = [limit1, limit2];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit2, result);

        limits = [limit2, limit1];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit2, result);

        done();
    });

    it("multiple limits: not limited", function (done) {
        const limit1 = [0, 3, 2, 0, 1];
        const limit2 = [0, 3, 3, 0, 1];
        const limit3 = [0, 3, 1, 0, 1];
        const limit4 = [0, 3, 4, 0, 1];
        const limit5 = [0, 3, 5, 0, 1];
        
        let limits = [limit1, limit2, limit3, limit4, limit5];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit3, result);

        limits = [limit1, limit2];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit1, result);

        done();
    });

    it("multiple limits: limited", function (done) {
        const limit1 = [0, 3, 2, 0, 1];
        const limit2 = [0, 3, 3, 0, 1];
        const limit3 = [0, 3, 1, 0, 1];
        const limit4 = [0, 3, 4, 0, 1];
        const limit5 = [1, 3, 5, 0, 1];
        
        let limits = [limit1, limit2, limit3, limit4, limit5];
        let result = getLowerRateLimit(limits);
        assert.deepEqual(limit5, result);

        limits = [limit1, limit2, limit5, limit3, limit4];
        result = getLowerRateLimit(limits);
        assert.deepEqual(limit5, result);

        done();
    });
});
