'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var _ = require('underscore');
var step = require('step');
var cartodbServer = require('../../../lib/server');
var ServerOptions = require('./support/ported-server-options');

var LayergroupToken = require('../../../lib/models/layergroup-token');

describe('torque', function () {
    var server;

    before(function () {
        server = cartodbServer(ServerOptions);
        server.setMaxListeners(0);
    });

    var keysToDelete;
    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    function checkCORSHeaders (res) {
        assert.strictEqual(
            res.headers['access-control-allow-headers'],
            'X-Requested-With, X-Prototype-Version, X-CSRF-Token, Authorization'
        );
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    }

    it('missing required property from torque layer', function (done) {
        var layergroup = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: 'select cartodb_id, the_geom from test_table',
                        geom_column: 'the_geom',
                        srid: 4326,
                        cartocss: 'Map { marker-fill:blue; }'
                    }
                }
            ]
        };

        step(
            function doPost1 () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) { next(null, res); });
            },
            function checkResponse (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error,
                    "Missing required property '-torque-frame-count' in torque layer CartoCSS");
                return null;
            },
            function doPost2 (err) {
                assert.ifError(err);
                var next = this;
                var css = 'Map { -torque-frame-count: 2; }';
                layergroup.layers[0].options.cartocss = css;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) { next(null, res); });
            },
            function checkResponse2 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error,
                    "Missing required property '-torque-resolution' in torque layer CartoCSS");
                return null;
            },
            function doPost3 (err) {
                assert.ifError(err);
                var next = this;
                var css = 'Map { -torque-frame-count: 2; -torque-resolution: 3; }';
                layergroup.layers[0].options.cartocss = css;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) { next(null, res); });
            },
            function checkResponse3 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error,
                    "Missing required property '-torque-aggregation-function' in torque layer CartoCSS");
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    // See http://github.com/CartoDB/Windshaft/issues/150
    it.skip('unquoted property in torque layer', function (done) {
        var layergroup = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: 'select updated_at as d, cartodb_id as id, the_geom from test_table',
                        geom_column: 'the_geom',
                        srid: 4326,
                        cartocss: 'Map { -torque-frame-count:2; -torque-resolution:3; -torque-time-attribute:"d"; ' +
                   '-torque-aggregation-function:count(id); }'
                    }
                }
            ]
        };
        step(
            function doPost1 () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) { next(null, res); });
            },
            function checkResponse (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error, 'Something meaningful here');
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    it('can render tile for valid mapconfig', function (done) {
        var mapconfig = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: "select 1 as id, '1970-01-02'::date as d, 'POINT(0 0)'::geometry as the_geom UNION ALL select 2, " +
                   "'1970-01-01'::date, 'POINT(1 1)'::geometry",
                        geom_column: 'the_geom',
                        cartocss: 'Map { -torque-frame-count:2; -torque-resolution:3; -torque-time-attribute:d; ' +
                   '-torque-aggregation-function:\'count(id)\'; }',
                        cartocss_version: '2.0.1'
                    }
                }
            ]
        };

        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(mapconfig)
                }, {}, function (res, err) { next(err, res); });
            },
            function checkPost (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
                // CORS headers should be sent with response
                // from layergroup creation via POST
                checkCORSHeaders(res);
                var parsedBody = JSON.parse(res.body);
                if (expectedToken) {
                    assert.deepStrictEqual(parsedBody, { layergroupid: expectedToken, layercount: 2 });
                } else {
                    expectedToken = parsedBody.layergroupid;
                }
                var meta = parsedBody.metadata;
                assert.ok(!_.isUndefined(meta),
                    'No metadata in torque MapConfig creation response: ' + res.body);
                var tm = meta.torque;
                assert.ok(tm,
                    'No "torque" in metadata:' + JSON.stringify(meta));
                var tm0 = tm[0];
                assert.ok(tm0,
                    'No layer 0 in "torque" in metadata:' + JSON.stringify(tm));
                var expectedTorqueMetadata = { start: 0, end: 86400000, data_steps: 2, column_type: 'date' };
                Object.keys(expectedTorqueMetadata).forEach(function (k) {
                    assert.strictEqual(tm0[k], expectedTorqueMetadata[k]);
                    assert.strictEqual(meta.layers[0].meta[k], expectedTorqueMetadata[k]);
                });
                return null;
            },
            function doGetTile (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/0/0.png',
                    method: 'GET',
                    encoding: 'binary',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkMapnikError1 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + (res.statusCode !== 200 ? (': ' + res.body) : ''));
                var parsed = JSON.parse(res.body);
                assert.strictEqual(parsed.errors.length, 1);
                assert.strictEqual(parsed.errors[0], "No 'mapnik' layers in MapConfig");
                return null;
            },
            function doGetGrid0 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/0/0/0.grid.json',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkMapnikError2 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + (res.statusCode !== 200 ? (': ' + res.body) : ''));
                var parsed = JSON.parse(res.body);
                assert.strictEqual(parsed.errors.length, 1);
                assert.strictEqual(parsed.errors[0], 'Unsupported format grid.json');
                return null;
            },
            function doGetTorque0 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/0/0/0.json.torque',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkTorque0Response (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.body);
                assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
                var tileContent = [{ x__uint8: 43, y__uint8: 43, vals__uint8: [1, 1], dates__uint16: [0, 1] }];
                var parsed = JSON.parse(res.body);
                assert.deepStrictEqual(tileContent, parsed);
                return null;
            },
            function doGetTorque01 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/0/0/0.torque.json',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkTorque0Response1 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.body);
                assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
                var tileContent = [{ x__uint8: 43, y__uint8: 43, vals__uint8: [1, 1], dates__uint16: [0, 1] }];
                var parsed = JSON.parse(res.body);
                assert.deepStrictEqual(tileContent, parsed);
                return null;
            },
            function finish (err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                done(err);
            }
        );
    });

    // Test that you cannot write to the database from a torque tile request
    //
    // Test for http://github.com/CartoDB/Windshaft/issues/130
    //
    it('database access is read-only', function (done) {
        var mapconfig = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: "select 'SRID=3857;POINT(0 0)'::geometry as g, now() as d,* from " +
                   "test_table_inserter(st_setsrid(st_point(0,0),4326),'write')",
                        geom_column: 'g',
                        cartocss: 'Map { -torque-frame-count:2; -torque-resolution:3; -torque-time-attribute:d; ' +
                   '-torque-aggregation-function:\'count(*)\'; }',
                        cartocss_version: '2.0.1'
                    }
                }
            ]
        };
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(mapconfig)
                }, {}, function (res, err) { next(err, res); });
            },
            function checkPost (err, res) {
                assert.ifError(err);
                // TODO: should be 403 Forbidden
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + (res.statusCode === 200 ? '...' : res.body));
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors);
                assert.strictEqual(parsed.errors.length, 1);
                var msg = parsed.errors[0];
                assert.strictEqual(msg, 'TorqueRenderer: cannot execute INSERT in a read-only transaction');
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    // See http://github.com/CartoDB/Windshaft/issues/164
    it('gives a 500 on database connection refused', function (done) {
        var mapconfig = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: "select 1 as id, '1970-01-03'::date as d, 'POINT(0 0)'::geometry as the_geom UNION ALL select 2, " +
                   "'1970-01-01'::date, 'POINT(1 1)'::geometry",
                        geom_column: 'the_geom',
                        cartocss: 'Map { -torque-frame-count:2; -torque-resolution:3; -torque-time-attribute:d; ' +
                   '-torque-aggregation-function:\'count(id)\'; }',
                        cartocss_version: '2.0.1'
                    }
                }
            ]
        };

        const defautlPort = global.environment.postgres.port;

        step(
            function doPost () {
                var next = this;
                global.environment.postgres.port = 54777;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(mapconfig)
                }, {}, function (res, err) { next(err, res); });
            },
            function checkPost (err, res) {
                assert.ifError(err);

                global.environment.postgres.port = defautlPort;

                assert.strictEqual(res.statusCode, 500, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error, 'TorqueRenderer: cannot connect to the database');
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    it('checks types for torque-specific styles', function (done) {
        var wrongStyle = ['Map {',
            '-torque-frame-count:512;',
            '-torque-animation-duration:30;',
            "-torque-time-attribute:'cartodb_id';",
            '-torque-aggregation-function:count(cartodb_id);', // unquoted aggregation function
            '-torque-resolution:4;',
            '-torque-data-aggregation:linear;',
            '}'].join(' ');
        var layergroup = {
            version: '1.1.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: 'select cartodb_id, the_geom from test_table',
                        geom_column: 'the_geom',
                        srid: 4326,
                        cartocss: wrongStyle
                    }
                }
            ]
        };

        step(
            function request () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) { next(null, res); });
            },
            function checkResponse (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 400, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors, parsed);
                var error = parsed.errors[0];
                assert.strictEqual(error,
                    "Unexpected type for property '-torque-aggregation-function', expected string");
                done();
                return null;
            }
        );
    });
});
