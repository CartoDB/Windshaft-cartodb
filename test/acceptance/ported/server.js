var testHelper = require('../../support/test_helper');

var assert = require('../../support/assert');
var cartodbServer = require('../../../lib/cartodb/server');
var ServerOptions = require('./support/ported_server_options');
var testClient = require('./support/test_client');

var BaseController = require('../../../lib/cartodb/controllers/base');

describe('server', function() {

    var server = cartodbServer(ServerOptions);
    server.setMaxListeners(0);

    var req2paramsFn;
    before(function() {
        req2paramsFn = BaseController.prototype.req2params;
        BaseController.prototype.req2params = ServerOptions.req2params;
    });

    after(function() {
        BaseController.prototype.req2params = req2paramsFn;

        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);
    });

    ////////////////////////////////////////////////////////////////////
    //
    // GET INVALID
    //
    ////////////////////////////////////////////////////////////////////

    it("get call to server returns 200",  function(done){
        assert.response(server, {
            url: '/',
            method: 'GET'
        },{
            // FIXME: shouldn't this be a 404 ?
            status: 200
        }, function() { done(); } );
    });

    ////////////////////////////////////////////////////////////////////
    //
    // GET VERSION
    //
    ////////////////////////////////////////////////////////////////////

    it("get /version returns versions",  function(done){
        assert.response(server, {
            url: '/version',
            method: 'GET'
        },{
            status: 200
        }, function(res) {
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('windshaft'), "No 'windshaft' version in " + parsed);
          assert.ok(parsed.hasOwnProperty('grainstore'), "No 'grainstore' version in " + parsed);
          assert.ok(parsed.hasOwnProperty('node_mapnik'), "No 'node_mapnik' version in " + parsed);
          assert.ok(parsed.hasOwnProperty('mapnik'), "No 'mapnik' version in " + parsed);
          // TODO: check actual versions ?
          done();
        });
    });

    ////////////////////////////////////////////////////////////////////
    //
    // GET GRID
    //
    ////////////////////////////////////////////////////////////////////

    it("grid jsonp",  function(done){
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table', null, null, 'name');
        testClient.getGridJsonp(mapConfig, 0, 13, 4011, 3088, 'jsonp_test', function(err, res) {
            assert.equal(res.statusCode, 200, res.body);
            assert.deepEqual(res.headers['content-type'], 'text/javascript; charset=utf-8');
            var didRunJsonCallback = false;
            var response = {};
            // jshint ignore:start
            function jsonp_test(body) {
                response = body;
                didRunJsonCallback = true;
            }
            eval(res.body);
            // jshint ignore:end
            assert.ok(didRunJsonCallback);
            assert.utfgridEqualsFile(response, './test/fixtures/test_table_13_4011_3088.grid.json', 2, done);
        });
    });

    it("get'ing a json with default style and single interactivity should return a grid",  function(done){
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table', null, null, 'name');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function(err, res) {
            var expected_json = {
                "1":{"name":"Hawai"},
                "2":{"name":"El Estocolmo"},
                "3":{"name":"El Rey del Tallarín"},
                "4":{"name":"El Lacón"},
                "5":{"name":"El Pico"}
            };
            assert.deepEqual(JSON.parse(res.body).data, expected_json);
            done();
        });
    });

    it("get'ing a json with default style and no interactivity should return an error",  function(done){
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table');
        var expectedResponse = {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, expectedResponse, function(err, res) {
            assert.deepEqual(JSON.parse(res.body).errors, ["Tileset has no interactivity"]);
            done();
        });
    });

    it("get grid jsonp error is returned with 200 status",  function(done){
        var mapConfig = testClient.singleLayerMapConfig('select * from test_table');
        var expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': 'text/javascript; charset=utf-8'
            }
        };
        testClient.getGridJsonp(mapConfig, 0, 13, 4011, 3088, 'test', expectedResponse, function(err, res) {
            assert.ok(res.body.match(/"errors":/), 'missing error in response: ' + res.body);
            done();
        });
    });

    // See http://github.com/Vizzuality/Windshaft/issues/50
    it("get'ing a json with no data should return an empty grid",  function(done){
        var query = 'select * from test_table limit 0';
        var mapConfig = testClient.singleLayerMapConfig(query, null, null, 'name');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function(err, res) {
            assert.utfgridEqualsFile(res.body, './test/fixtures/test_table_13_4011_3088_empty.grid.json', 2, done);
        });
    });

    // Another test for http://github.com/Vizzuality/Windshaft/issues/50
    it("get'ing a json with no data but interactivity should return an empty grid",  function(done){
        var query = 'SELECT * FROM test_table limit 0';
        var mapConfig = testClient.singleLayerMapConfig(query, null, null, 'cartodb_id');
        testClient.getGrid(mapConfig, 0, 13, 4011, 3088, function(err, res) {
            assert.utfgridEqualsFile(res.body, './test/fixtures/test_table_13_4011_3088_empty.grid.json', 2, done);
        });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/67
    it("get'ing a solid grid while changing interactivity fields",  function(done){
        var query = 'SELECT * FROM test_big_poly';
        var style211 = "#test_big_poly{polygon-fill:blue;}"; // for solid
        var mapConfigName = testClient.singleLayerMapConfig(query, style211, null, 'name');
        testClient.getGrid(mapConfigName, 0, 3, 2, 2, function(err, res) {
            var expected_data = { "1":{"name":"west"} };
            assert.deepEqual(JSON.parse(res.body).data, expected_data);

            var mapConfigCartodbId = testClient.singleLayerMapConfig(query, style211, null, 'cartodb_id');
            testClient.getGrid(mapConfigCartodbId, 0, 3, 2, 2, function(err, res) {
                var expected_data = { "1":{"cartodb_id":"1"} };
                assert.deepEqual(JSON.parse(res.body).data, expected_data);
                done();
            });
        });
    });

});
