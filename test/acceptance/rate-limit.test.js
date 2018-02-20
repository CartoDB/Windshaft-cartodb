require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const redis = require('redis');
const {
    RATE_LIMIT_ENDPOINTS_GROUPS,
    RATE_LIMIT_STORE_KEY
} = require('../../lib/cartodb/middleware/rate-limit');


let redisClient;
let testClient;
let keysToDelete = ['user:localhost:mapviews:global'];
const user = 'cdb';

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
    redisClient.SELECT(8, function(err) {
        if (err) {
            return;
        }

        const key = RATE_LIMIT_STORE_KEY + user + ':' + RATE_LIMIT_ENDPOINTS_GROUPS.ENDPOINT_1;
        redisClient.hset(key, 'b', burst, 'c', count, 'p', period, function() {
            keysToDelete.push(key);
        });
    });
}

describe('rate limit acceptance', function() {
    before(function() {
        redisClient = redis.createClient(global.environment.redis.port);
        testClient = new TestClient(createMapConfig(), 1234);
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

        testClient.getLayergroup({ response }, (err) => {
            assert.ifError(err);
            setTimeout(done, period * 1000);
        });
    });

    it("1 req/sec: 5 request (1 per 250ms) should be limited: OK, KO, KO, KO, OK", function(done) {
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

        testClient.getLayergroup({ response }, (err, res) => {
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

                testClient.getLayergroup({ response }, (err) => {
                    assert.ifError(err);
                });
            },
            250
        );

        setTimeout(
            function() {
                let response = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'X-Rate-Limit-Limit': '2',
                        'X-Rate-Limit-Remaining': '0',
                        'X-Rate-Limit-Reset': '2',
                        'X-Rate-Limit-Retry-After': '-1'
                    }
                };

                testClient.getLayergroup({ response }, (err) => {
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
                        'X-Rate-Limit-Reset': '2',
                        'X-Rate-Limit-Retry-After': '1'
                    }
                };

                testClient.getLayergroup({ response }, (err) => {
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
                        'X-Rate-Limit-Reset': '2',
                        'X-Rate-Limit-Retry-After': '1'
                    }
                };

                testClient.getLayergroup({ response }, (err) => {
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
                        'X-Rate-Limit-Reset': '2',
                        'X-Rate-Limit-Retry-After': '-1'
                    }
                };

                testClient.getLayergroup({ response }, (err) => {
                    assert.ifError(err);
                    done();
                });
            },
            1050
        );
    });

});