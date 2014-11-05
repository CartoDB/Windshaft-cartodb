var helper = require(__dirname + '/../support/test_helper');

var assert      = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);

var SQLAPIEmu  = require(__dirname + '/../support/SQLAPIEmu.js');


[true, false].forEach(function(cdbQueryTablesFromPostgresEnabledValue) {

    global.environment.enabledFeatures = {cdbQueryTablesFromPostgres: cdbQueryTablesFromPostgresEnabledValue};

    suite('health checks - postgres=' + cdbQueryTablesFromPostgresEnabledValue, function () {

        beforeEach(function (done) {
            global.environment.health = {
                enabled: true,
                username: 'localhost',
                query: "SELECT 1::int as interactivity_id, '0101000020110F0000EE866678CE876D41466F35C2EC1150C1'::geometry as geom, 'Lorem ipsum dolor sit amet' as label",
                srid: 3857,
                geometry_field: 'geom',
                z: 0,
                x: 0,
                y: 0
            };
            done();
        });

        if (!cdbQueryTablesFromPostgresEnabledValue) {
            var sqlApiServer;

            before(function (done) {
                sqlApiServer = new SQLAPIEmu(global.environment.sqlapi.port, done);
            });

            after(function (done) {
                sqlApiServer.close(done);
            });
        }

        var healthCheckRequest = {
            url: '/health',
            method: 'GET',
            headers: {
                host: 'localhost'
            }
        };

        test('returns 200 and ok=true with disabled configuration', function (done) {
            global.environment.health.enabled = false;

            assert.response(server,
                healthCheckRequest,
                {
                    status: 200
                },
                function (res, err) {
                    assert.ok(!err);

                    var parsed = JSON.parse(res.body);

                    assert.equal(parsed.enabled, false);
                    assert.ok(parsed.ok);

                    done();
                }
            );
        });

        test('returns 200 and ok=true with enabled configuration', function (done) {
            assert.response(server,
                healthCheckRequest,
                {
                    status: 200
                },
                function (res, err) {
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

        test.skip('fails for wrong query', function (done) {
            global.environment.health.query = 'select wadus query';

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

                    assert.ok(parsed.result.redis.ok);

                    assert.equal(parsed.result.postgresql.ok, false);

                    done();
                }
            );
        });

    });

});