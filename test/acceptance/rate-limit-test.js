'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const TestClient = require('../support/test-client');
const UserLimitsBackend = require('../../lib/backends/user-limits');
const rateLimitMiddleware = require('../../lib/api/middlewares/rate-limit');
const serverOptions = require('../../lib/server-options');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimitMiddleware;

let userLimitsApi;
let rateLimit;
let redisClient;
let testClient;
const keysToDelete = ['user:localhost:mapviews:global'];
const user = 'localhost';
let layergroupid;

const query = `
    SELECT
        ST_Transform('SRID=4326;POINT(-70 42)'::geometry, 3857) the_geom_webmercator,
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

function setLimit (count, period, burst, endpoint = RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS) {
    redisClient.SELECT(8, err => {
        if (err) {
            return;
        }

        const key = `limits:rate:store:${user}:maps:${endpoint}`;
        redisClient.rpush(key, burst);
        redisClient.rpush(key, count);
        redisClient.rpush(key, period);
        keysToDelete.push(key);
    });
}

function getReqAndRes () {
    return {
        req: {},
        res: {
            headers: {},
            set (headers, value) {
                if (typeof headers === 'object') {
                    this.headers = headers;
                } else {
                    this.headers[headers] = value;
                }
            },
            locals: {
                user: 'localhost'
            }
        }
    };
}

function assertGetLayergroupRequest (status, limit, remaining, reset, retry, done) {
    const response = {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Carto-Rate-Limit-Limit': limit,
            'Carto-Rate-Limit-Remaining': remaining,
            'Carto-Rate-Limit-Reset': reset
        }
    };

    if (retry) {
        response.headers['Retry-After'] = retry;
    }

    testClient.getLayergroup({ response }, err => {
        assert.ifError(err);
        if (done) {
            setTimeout(done, 1000);
        }
    });
}

function assertRateLimitRequest (status, limit, remaining, reset, retry, done) {
    const { req, res } = getReqAndRes();
    rateLimit(req, res, function (err) {
        const expectedHeaders = {
            'Carto-Rate-Limit-Limit': limit,
            'Carto-Rate-Limit-Remaining': remaining,
            'Carto-Rate-Limit-Reset': reset
        };

        if (retry) {
            expectedHeaders['Retry-After'] = retry;
        }

        assert.deepStrictEqual(res.headers, expectedHeaders);

        if (status === 200) {
            assert.ifError(err);
        } else {
            assert.ok(err);
            assert.strictEqual(err.message, 'You are over platform\'s limits: too many requests.' +
                                      ' Please contact us to know more details');
            assert.strictEqual(err.http_status, 429);
            assert.strictEqual(err.type, 'limit');
            assert.strictEqual(err.subtype, 'rate-limit');
        }

        if (done) {
            setTimeout(done, 1000);
        }
    });
}

describe('rate limit', function () {
    before(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = true;

        redisClient = redis.createClient(global.environment.redis.port);
        testClient = new TestClient(createMapConfig(), 1234);
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = false;
    });

    afterEach(function (done) {
        keysToDelete.forEach(key => {
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

        assertGetLayergroupRequest(200, '2', '1', '1', null, done);
    });

    it('1 req/sec: 2 req/seg should be limited', function (done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        assertGetLayergroupRequest(200, '2', '1', '1');
        setTimeout(() => assertGetLayergroupRequest(200, '2', '0', '1'), 250);
        setTimeout(() => assertGetLayergroupRequest(429, '2', '0', '1', '1'), 500);
        setTimeout(() => assertGetLayergroupRequest(429, '2', '0', '1', '1'), 750);
        setTimeout(() => assertGetLayergroupRequest(429, '2', '0', '1', '1'), 950);
        setTimeout(() => assertGetLayergroupRequest(200, '2', '0', '1', null, done), 1050);
    });
});

describe('rate limit middleware', function () {
    before(function (done) {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = true;

        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({ pool: redisPool });
        userLimitsApi = new UserLimitsBackend(metadataBackend, {
            limits: {
                rateLimitsEnabled: global.environment.enabledFeatures.rateLimitsEnabled
            }
        });
        rateLimit = rateLimitMiddleware(userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS);

        redisClient = redis.createClient(global.environment.redis.port);
        testClient = new TestClient(createMapConfig(), 1234);

        const count = 1;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst);

        setTimeout(done, 1000);
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = false;

        keysToDelete.forEach(key => {
            redisClient.del(key);
        });
    });

    it('1 req/sec: 2 req/seg should be limited', function (done) {
        assertRateLimitRequest(200, 1, 0, 1);
        setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 250);
        setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 500);
        setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 750);
        setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 950);
        setTimeout(() => assertRateLimitRequest(200, 1, 0, 1, null, done), 1050);
    });

    it('1 req/sec: 2 req/seg should be limited, removing SHA script from Redis', function (done) {
        userLimitsApi.metadataBackend.redisCmd(
            8,
            'SCRIPT',
            ['FLUSH'],
            function () {
                assertRateLimitRequest(200, 1, 0, 1);
                setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 500);
                setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 500);
                setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 750);
                setTimeout(() => assertRateLimitRequest(429, 1, 0, 0, 1), 950);
                setTimeout(() => assertRateLimitRequest(200, 1, 0, 1, null, done), 1050);
            }
        );
    });
});

const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

describe('rate limit and vector tiles (mapnik)', () => rateLimitAndVectorTilesTest(false));
describe('rate limit and vector tiles (postgis)', () => rateLimitAndVectorTilesTest(true));

function rateLimitAndVectorTilesTest (usePostGIS) {
    before(function () {
        serverOptions.renderer.mvt.usePostGIS = usePostGIS;
    });

    after(function () {
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    before(function (done) {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = true;

        redisClient = redis.createClient(global.environment.redis.port);
        const count = 1;
        const period = 1;
        const burst = 0;
        setLimit(count, period, burst, RATE_LIMIT_ENDPOINTS_GROUPS.TILE);

        testClient = new TestClient(createMapConfig(), 1234);
        testClient.getLayergroup({ status: 200 }, (err, res) => {
            assert.ifError(err);

            layergroupid = res.layergroupid;

            done();
        });
    });

    after(function () {
        global.environment.enabledFeatures.rateLimitsEnabled = false;
        global.environment.enabledFeatures.rateLimitsByEndpoint.tile = false;
    });

    afterEach(function (done) {
        keysToDelete.forEach(key => {
            redisClient.del(key);
        });

        redisClient.SELECT(0, () => {
            redisClient.del('user:localhost:mapviews:global');

            redisClient.SELECT(5, () => {
                redisClient.del('user:localhost:mapviews:global');
                setTimeout(done, 1000);
            });
        });
    });

    it('mvt rate limited', function (done) {
        const tileParams = (status, limit, remaining, reset, retry, contentType) => {
            const headers = {
                'Content-Type': contentType,
                'Carto-Rate-Limit-Limit': limit,
                'Carto-Rate-Limit-Remaining': remaining,
                'Carto-Rate-Limit-Reset': reset
            };

            if (retry) {
                headers['Retry-After'] = retry;
            }

            return {
                layergroupid: layergroupid,
                format: 'mvt',
                response: { status, headers }
            };
        };

        testClient.getTile(0, 0, 0, tileParams(200, '1', '0', '1'), (err) => {
            assert.ifError(err);

            testClient.getTile(
                0,
                0,
                0,
                tileParams(429, '1', '0', '0', '1', 'application/x-protobuf'),
                (err, res, tile) => {
                    assert.ifError(err);

                    var tileJSON = tile.toJSON();
                    assert.strictEqual(Array.isArray(tileJSON), true);
                    assert.strictEqual(tileJSON.length, 2);
                    assert.strictEqual(tileJSON[0].name, 'errorTileSquareLayer');
                    assert.strictEqual(tileJSON[1].name, 'errorTileStripesLayer');

                    done();
                }
            );
        });
    });
}
