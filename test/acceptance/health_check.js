var helper = require(__dirname + '/../support/test_helper');

var assert      = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);

suite('health checks', function () {

    beforeEach(function (done) {
        global.environment.health = {
            enabled: true,
            username: 'localhost',
            z: 0,
            x: 0,
            y: 0
        };
        done();
    });

    var healthCheckRequest = {
        url: '/health',
        method: 'GET',
        headers: {
            host: 'localhost'
        }
    };

    test('returns 200 and ok=true with enabled configuration', function (done) {
        assert.response(server,
            healthCheckRequest,
            {
                status: 200
            },
            function (res, err) {
              console.log(res.body);
                assert.ok(!err);

                var parsed = JSON.parse(res.body);

                assert.ok(parsed.enabled);
                assert.ok(parsed.ok);

                done();
            }
        );
    });

    test('fails for invalid user because it is not in redis', function (done) {
        global.environment.health.username = 'invalid';

        assert.response(server,
            healthCheckRequest,
            {
                status: 503
            },
            function (res, err) {
                assert.ok(!err);

                var parsed = JSON.parse(res.body);

                assert.equal(parsed.enabled, true);
                assert.equal(parsed.ok, false);

                assert.equal(parsed.result.redis.ok, false);

                done();
            }
        );
    });

});
