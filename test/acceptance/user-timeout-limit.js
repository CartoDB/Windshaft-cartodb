require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');
var testHelper = require('../support/test_helper');

var redis = require('redis');
var keysToDelete;

function withUserTimeoutRenderLimit(redisClient, user, userTimeoutLimit, callback) {
    redisClient.SELECT(5, function(err) {
        if (err) {
            return callback(err);
        }

        var userTimeoutLimitsKey = 'limits:timeout:' + user;
        var redisParams = [
            userTimeoutLimitsKey,
            'render', userTimeoutLimit,
            'render_public', userTimeoutLimit
        ];

        redisClient.hmset(redisParams, function (err) {
            if (err) {
                return callback(err);
            }
            keysToDelete[userTimeoutLimitsKey] = 5;
            return callback();
        });
    });
}

function createMapConfig (cartocss) {
    return {
        version: '1.6.0',
        layers: [{
            type: "cartodb",
            options: {
                sql: [
                    'SELECT',
                    ' pg_sleep(1),',
                    ' 1 cartodb_id,',
                    ' \'SRID=3857;POINT(0 0)\'::geometry the_geom_webmercator'
                ].join('\n'),
                cartocss: cartocss,
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            }
        }]
    };
}



describe('user timeout limits', function () {
    var redisClient = redis.createClient(global.environment.redis.port);

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    it('layergroup creation works even if test tile is slow', function (done) {
        withUserTimeoutRenderLimit(redisClient, 'localhost', 1, function (err) {
            if (err) {
                return done(err);
            }

            var mapConfig = createMapConfig(TestClient.CARTOCSS.POINTS);
            var testClient = new TestClient(mapConfig, 1234);
            testClient.getTile(4, 4, 4, {}, function (err, res, tile) {
                assert.ok(err, err);
                // TODO: check timeout tile

                testClient.drain(done)
            });
        });
    });
});
