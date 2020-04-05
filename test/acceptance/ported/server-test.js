'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var cartodbServer = require('../../../lib/server');
var ServerOptions = require('./support/ported-server-options');
var testClient = require('./support/test-client');

describe('server', function () {
    var server;

    before(function () {
        server = cartodbServer(ServerOptions);
        server.setMaxListeners(0);
    });

    after(function () {
        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);
    });

    /// /////////////////////////////////////////////////////////////////
    //
    // GET INVALID
    //
    /// /////////////////////////////////////////////////////////////////

    it('get call to server returns 200', function (done) {
        assert.response(server, {
            url: '/',
            method: 'GET'
        }, {
            // FIXME: shouldn't this be a 404 ?
            status: 200
        }, function () { done(); });
    });

    /// /////////////////////////////////////////////////////////////////
    //
    // GET GRID
    //
    /// /////////////////////////////////////////////////////////////////

    it('grid jsonp', function (done) {
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table', null, null, 'name');
        testClient.getGridJsonp(mapConfig, 0, 13, 4011, 3088, 'jsonpTest', function (err, res) {
            assert.ifError(err);
            assert.strictEqual(res.statusCode, 200, res.body);
            assert.deepStrictEqual(res.headers['content-type'], 'text/javascript; charset=utf-8');
            var didRunJsonCallback = false;
            var response = {};
            /* eslint-disable no-unused-vars, no-eval */
            function jsonpTest (body) {
                response = body;
                didRunJsonCallback = true;
            }
            eval(res.body);
            /* eslint-enable */
            assert.ok(didRunJsonCallback);
            assert.utfgridEqualsFile(response, './test/fixtures/test_table_13_4011_3088.grid.json', 2, done);
        });
    });

    it("get'ing a json with default style and single interactivity should return a grid", function (done) {
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table', null, null, 'name');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function (err, res) {
            assert.ifError(err);
            var expectedJson = {
                1: { name: 'Hawai' },
                2: { name: 'El Estocolmo' },
                3: { name: 'El Rey del Tallarín' },
                4: { name: 'El Lacón' },
                5: { name: 'El Pico' }
            };
            assert.deepStrictEqual(JSON.parse(res.body).data, expectedJson);
            done();
        });
    });

    it("get'ing a json with default style and no interactivity should return an error", function (done) {
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table');
        var expectedResponse = {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, expectedResponse, function (err, res) {
            assert.ifError(err);
            assert.deepStrictEqual(JSON.parse(res.body).errors, ['Tileset has no interactivity']);
            done();
        });
    });

    it('get grid jsonp error is returned with 200 status', function (done) {
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table');
        var expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': 'text/javascript; charset=utf-8'
            }
        };
        testClient.getGridJsonp(mapConfig, 0, 13, 4011, 3088, 'test', expectedResponse, function (err, res) {
            assert.ifError(err);
            assert.ok(res.body.match(/"errors":/), 'missing error in response: ' + res.body);
            done();
        });
    });

    // See http://github.com/Vizzuality/Windshaft/issues/50
    it("get'ing a json with no data should return an empty grid", function (done) {
        var query = 'select * from test_table limit 0';
        var mapConfig = testClient.singleLayerMapConfig(query, null, null, 'name');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function (err, res) {
            assert.ifError(err);
            assert.utfgridEqualsFile(res.body, './test/fixtures/test_table_13_4011_3088_empty.grid.json', 2, done);
        });
    });

    // Another test for http://github.com/Vizzuality/Windshaft/issues/50
    it("get'ing a json with no data but interactivity should return an empty grid", function (done) {
        var query = 'SELECT * FROM test_table limit 0';
        var mapConfig = testClient.singleLayerMapConfig(query, null, null, 'cartodb_id');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function (err, res) {
            assert.ifError(err);
            assert.utfgridEqualsFile(res.body, './test/fixtures/test_table_13_4011_3088_empty.grid.json', 2, done);
        });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/67
    it("get'ing a solid grid while changing interactivity fields", function (done) {
        var query = 'SELECT * FROM test_big_poly';
        var style211 = '#test_big_poly{polygon-fill:blue;}'; // for solid
        var mapConfigName = testClient.singleLayerMapConfig(query, style211, null, 'name');
        testClient.getGrid(mapConfigName, 0, 3, 2, 2, function (err, res) {
            assert.ifError(err);
            var expectedData = { 1: { name: 'west' } };
            assert.deepStrictEqual(JSON.parse(res.body).data, expectedData);

            var mapConfigCartodbId = testClient.singleLayerMapConfig(query, style211, null, 'cartodb_id');
            testClient.getGrid(mapConfigCartodbId, 0, 3, 2, 2, function (err, res) {
                assert.ifError(err);
                var expectedData = { 1: { cartodb_id: 1 } };
                assert.deepStrictEqual(JSON.parse(res.body).data, expectedData);
                done();
            });
        });
    });
});
