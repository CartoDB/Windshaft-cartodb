'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var step = require('step');
var cartodbServer = require('../../../lib/server');
var PortedServerOptions = require('./support/ported-server-options');
var LayergroupToken = require('../../../lib/models/layergroup-token');

describe('attributes', function () {
    var server;

    before(function () {
        server = cartodbServer(PortedServerOptions);
        server.setMaxListeners(0);
    });

    var testMapconfig1 = {
        version: '1.1.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: "select 1 as id, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                    cartocss: '#style { }',
                    cartocss_version: '2.0.1'
                }
            },
            {
                type: 'mapnik',
                options: {
                    sql: "select 1 as i, 6 as n, 'SRID=4326;POINT(0 0)'::geometry as the_geom",
                    attributes: { id: 'i', columns: ['n'] },
                    cartocss: '#style { }',
                    cartocss_version: '2.0.1'
                }
            }
        ]
    };

    function checkCORSHeaders (res) {
        assert.strictEqual(
            res.headers['access-control-allow-headers'],
            'X-Requested-With, X-Prototype-Version, X-CSRF-Token, Authorization, ' +
            'Carto-Event, Carto-Event-Source, Carto-Event-Group-Id'
        );
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    }

    var keysToDelete;

    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    it('can only be fetched from layer having an attributes spec', function (done) {
        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(testMapconfig1)
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
                return null;
            },
            function doGetAttr0 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/attributes/1',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkError0 (err, res) {
                assert.ifError(err);
                assert.strictEqual(
                    res.statusCode,
                    400,
                    res.statusCode + (res.statusCode !== 200 ? (': ' + res.body) : '')
                );
                var parsed = JSON.parse(res.body);
                assert.strictEqual(parsed.errors[0], 'Layer 0 has no exposed attributes');
                return null;
            },
            function doGetAttr1 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/1/attributes/1',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkAttr1 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.deepStrictEqual(parsed, { n: 6 });
                return null;
            },
            function doGetAttr1404 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/1/attributes/-666',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkAttr1404 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 404, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors);
                var msg = parsed.errors[0];
                assert.strictEqual(msg, "Multiple features (0) identified by 'i' = -666 in layer 1");
                return null;
            },
            function finish (err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done(err);
            }
        );
    });

    // See https://github.com/CartoDB/Windshaft/issues/131
    it('are checked at map creation time', function (done) {
        // clone the mapconfig test
        var mapconfig = JSON.parse(JSON.stringify(testMapconfig1));
        // append unexistant attribute name
        mapconfig.layers[1].options.sql = 'SELECT * FROM test_table';
        mapconfig.layers[1].options.attributes.id = 'unexistant';
        mapconfig.layers[1].options.attributes.columns = ['cartodb_id'];

        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(mapconfig)
                }, {}, function (res, err) { next(err, res); });
            },
            function checkPost (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 404, res.statusCode + ': ' + (res.statusCode === 200 ? '...' : res.body));
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors);
                assert.strictEqual(parsed.errors.length, 1);
                var msg = parsed.errors[0];
                assert.strictEqual(msg, 'column "unexistant" does not exist');
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    it('can be used with jsonp', function (done) {
        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(testMapconfig1)
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
                return null;
            },
            function doGetAttr0 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken +
                        '/0/attributes/1?callback=test',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkError0 (err, res) {
                assert.ifError(err);
                // jsonp errors should be returned with HTTP status 200
                assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
                assert.strictEqual(
                    res.body,
                    '/**/ typeof test === \'function\' && ' +
                    'test({"errors":["Layer 0 has no exposed attributes"],' +
                    '"errors_with_context":[{' +
                    '"type":"unknown","message":"Layer 0 has no exposed attributes"' +
                    '}]});'
                );
                return null;
            },
            function doGetAttr1 (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/1/attributes/1',
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkAttr1 (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
                var parsed = JSON.parse(res.body);
                assert.deepStrictEqual(parsed, { n: 6 });
                return null;
            },
            function finish (err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done(err);
            }
        );
    });

    // Test that you cannot write to the database from an attributes tile request
    //
    // Test for http://github.com/CartoDB/Windshaft/issues/130
    //
    it('database access is read-only', function (done) {
        // clone the mapconfig test
        var mapconfig = JSON.parse(JSON.stringify(testMapconfig1));
        mapconfig.layers[1].options.sql +=
            ", test_table_inserter(st_setsrid(st_point(0,0),4326),'write') as w";
        mapconfig.layers[1].options.attributes.columns.push('w');

        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
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
                assert.strictEqual(msg, 'cannot execute INSERT in a read-only transaction');
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });
});
