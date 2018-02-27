require('../support/test_helper');

const assert = require('../support/assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const TestClient = require('../support/test-client');
const rateLimitMiddleware = require('../../lib/cartodb/middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS, getStoreKey } = rateLimitMiddleware;

let rateLimit;
let redisClient;
let testClient;
let keysToDelete = ['user:localhost:mapviews:global'];
const user = 'localhost';

const query = `
    SELECT
        ST_Transform('SRID=4326;POINT(-180 85.05112877)'::geometry, 3857) the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

const createMapConfig = ({
    version = '1.6.0',
    type = 'cartodb',
    sql = query,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    interactivity = 'cartodb_id',
    countBy = 'cartodb_id'
} = {}) => ({
    version,
    layers: [{
        type,
        options: {
            source: {
                id: 'a0'
            },
            cartocss,
            cartocss_version,
            interactivity
        }
    }],
    analyses: [
        {
            id: 'a0',
            type: 'source',
            params: {
                query: sql
            }
        }
    ],
    dataviews: {
        count: {
            source: {
                id: 'a0'
            },
            type: 'formula',
            options: {
                column: countBy,
                operation: 'count'
            }
        }
    }
});


function setLimit(count, period, burst) {
    redisClient.SELECT(8, err => {
        if (err) {
            return;
        }

        const key = getStoreKey(user, RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS);        
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
            },
            locals: {
                user: 'localhost'
            }
        }
    };
}

describe('rate limit', function() {
    before(function() {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = true;
        
        redisClient = redis.createClient(global.environment.redis.port);
        testClient = new TestClient(createMapConfig(), 1234);
    });

    after(function() {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = false;
    });

    afterEach(function(done) {
        keysToDelete.forEach( key => {
            redisClient.del(key);
        });

        redisClient.SELECT(0, () => {
            redisClient.del('user:localhost:mapviews:global');

            redisClient.SELECT(5, () => {
                redisClient.del('user:localhost:mapviews:global');
                done();
            });
        });
    }); 

    it('should not be rate limited', function (done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        let response = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Rate-Limit-Limit': '2',
                'X-Rate-Limit-Remaining': '1',
                'X-Rate-Limit-Reset': '1',
                'X-Rate-Limit-Retry-After': '-1'
            }
        };

        testClient.getLayergroup({ response }, err => {
            assert.ifError(err);
            setTimeout(done, period * 1000);
        });
    });

    it("1 req/sec: 2 req/seg should be limited", function(done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        let response = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Rate-Limit-Limit': '2',
                'X-Rate-Limit-Remaining': '1',
                'X-Rate-Limit-Reset': '1',
                'X-Rate-Limit-Retry-After': '-1'
            }
        };

        testClient.getLayergroup({ response }, err => {
            assert.ifError(err);
        });

        setTimeout(
            function() {
                let response = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '1',
                        'X-Rate-Limit-Retry-After': '-1'
                    }
                };

                testClient.getLayergroup({ response }, err => {
                    assert.ifError(err);
                });
            },
            250
        );

        setTimeout(
            function() {
                let response = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '1',
                        'X-Rate-Limit-Retry-After': '0'
                    }
                };

                testClient.getLayergroup({ response }, err => {
                    assert.ifError(err);
                });
            },
            500
        );

        setTimeout(
            function() {
                let response = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '1',
                        'X-Rate-Limit-Retry-After': '0'
                    }
                };

                testClient.getLayergroup({ response }, err => {
                    assert.ifError(err);
                });
            },
            750
        );

        setTimeout(
            function() {
                let response = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '1',
                        'X-Rate-Limit-Retry-After': '0'
                    }
                };

                testClient.getLayergroup({ response }, err => {
                    assert.ifError(err);
                });
            },
            950
        );
        
        setTimeout(
            function() {
                let response = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '1',
                        'X-Rate-Limit-Retry-After': '-1'
                    }
                };

                testClient.getLayergroup({ response }, err => {
                    assert.ifError(err);
                    setTimeout(done, period * 2 * 1000);
                });
            },
            1050
        );
    });

});


describe('rate limit middleware', function () {
    before(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = true;

        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({ pool: redisPool });
        rateLimit = rateLimitMiddleware(metadataBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS);

        redisClient = redis.createClient(global.environment.redis.port);
        testClient = new TestClient(createMapConfig(), 1234);


        const count = 1;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = false;

        keysToDelete.forEach(key => {
            redisClient.del(key);
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

    it("1 req/sec: 2 req/seg should be limited", function (done) {
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
                    assert.ok(err);
                    assert.deepEqual(res.headers, {
                        "X-Rate-Limit-Limit": 1,
                        "X-Rate-Limit-Remaining": 0,
                        "X-Rate-Limit-Reset": 0,
                        "X-Rate-Limit-Retry-After": 0
                    });
                    assert.equal(err.message, 'You are over the limits.');
                    assert.equal(err.http_status, 429);
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
                        "X-Rate-Limit-Reset": 0,
                        "X-Rate-Limit-Retry-After": 0
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
                        "X-Rate-Limit-Reset": 0,
                        "X-Rate-Limit-Retry-After": 0
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
                        "X-Rate-Limit-Reset": 0,
                        "X-Rate-Limit-Retry-After": 0
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
