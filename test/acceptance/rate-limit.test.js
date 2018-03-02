require('../support/test_helper');

const assert = require('../support/assert');
const redis = require('redis');
const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');
const TestClient = require('../support/test-client');
const UserLimitsApi = require('../../lib/cartodb/api/user_limits_api');
const rateLimitMiddleware = require('../../lib/cartodb/middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimitMiddleware;
const { getStoreKey } = require('../../lib/cartodb/api/user_limits_api');

let userLimitsApi; 
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

function assertGetLayergroupRequest (status, limit, remaining, reset, retry, done = null) {
    const response = {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Rate-Limit-Limit': limit,
            'X-Rate-Limit-Remaining': remaining,
            'X-Rate-Limit-Reset': reset,
            'X-Rate-Limit-Retry-After': retry
        }
    };

    testClient.getLayergroup({ response }, err => {
        assert.ifError(err);
        if (done) {
            setTimeout(done, 1000);
        }
    });
}

function assertRateLimitRequest (status, limit, remaining, reset, retry, done = null) {
    const { req, res } = getReqAndRes();
    rateLimit(req, res, function (err) {
        assert.deepEqual(res.headers, {
            "X-Rate-Limit-Limit": limit,
            "X-Rate-Limit-Remaining": remaining,
            "X-Rate-Limit-Reset": reset,
            "X-Rate-Limit-Retry-After": retry
        });

        if(status === 200) {
            assert.ifError(err);
        } else {
            assert.ok(err);
            assert.equal(err.message, 'You are over the limits.');
            assert.equal(err.http_status, 429);
        }

        if (done) {
            setTimeout(done, 1000);
        }
    });
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

        assertGetLayergroupRequest(200, '2', '1', '1', '-1', done);
    });

    it("1 req/sec: 2 req/seg should be limited", function(done) {
        const count = 1;
        const period = 1;
        const burst = 1;
        setLimit(count, period, burst);

        assertGetLayergroupRequest(200, '2', '1', '1', '-1');
        setTimeout( () => assertGetLayergroupRequest(200, '2', '0', '1', '-1'), 250);
        setTimeout( () => assertGetLayergroupRequest(429, '2', '0', '1', '0'),  500);
        setTimeout( () => assertGetLayergroupRequest(429, '2', '0', '1', '0'),  750);
        setTimeout( () => assertGetLayergroupRequest(429, '2', '0', '1', '0'),  950);
        setTimeout( () => assertGetLayergroupRequest(200, '2', '0', '1', '-1', done), 1050);
    });

});


describe('rate limit middleware', function () {
    before(function (done) {
        global.environment.enabledFeatures.rateLimitsEnabled = true;
        global.environment.enabledFeatures.rateLimitsByEndpoint.anonymous = true;

        const redisPool = new RedisPool(global.environment.redis);
        const metadataBackend = cartodbRedis({ pool: redisPool });
        userLimitsApi = new UserLimitsApi(metadataBackend, {
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

    it("1 req/sec: 2 req/seg should be limited", function (done) {
        assertRateLimitRequest(200, 1, 0, 1, -1);
        setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 250);
        setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 500);
        setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 750);
        setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 950);
        setTimeout( () => assertRateLimitRequest(200, 1, 0, 1, -1, done), 1050);
    });

    it("1 req/sec: 2 req/seg should be limited, removing SHA script from Redis", function (done) {
        userLimitsApi.metadataBackend.redisCmd(
            8, 
            'SCRIPT', 
            ['FLUSH'], 
            function () {
                assertRateLimitRequest(200, 1, 0, 1, -1);
                setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 500);
                setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 500);
                setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 750);
                setTimeout( () => assertRateLimitRequest(429, 1, 0, 0, 0), 950);
                setTimeout( () => assertRateLimitRequest(200, 1, 0, 1, -1, done), 1050);
            }
        );
    });
});
