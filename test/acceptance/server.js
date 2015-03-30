var assert      = require('../support/assert');
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
var step        = require('step');

var helper = require(__dirname + '/../support/test_helper');

var IMAGE_EQUALS_TOLERANCE_PER_MIL = 20;

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

var cdbQueryTablesFromPostgresEnabledValue = true;

suite('server', function() {

    // TODO: I guess this should be a 404 instead...
    test("get call to server returns 200", function(done){
      step(
        function doGet() {
          var next = this;
          assert.response(server, {
              url: '/',
              method: 'GET'
          },{}, function(res, err) { next(err,res); });
        },
        function doCheck(err, res) {
          if ( err ) throw err;
          assert.ok(res.statusCode, 200);
          var cc = res.headers['x-cache-channel'];
          assert.ok(!cc);
          return null;
        },
        function finish(err) {
          done(err);
        }
      );
    });

    test("get call to server returns 200", function(done){
        assert.response(server, {
            url: '/version',
            method: 'GET'
        },{
          status: 200
        }, function(res) {
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.hasOwnProperty('windshaft_cartodb'), "No 'windshaft_cartodb' version in " + parsed);
          console.log("Windshaft-cartodb: " + parsed.windshaft_cartodb);
          assert.ok(parsed.hasOwnProperty('windshaft'), "No 'windshaft' version in " + parsed);
          console.log("Windshaft: " + parsed.windshaft);
          assert.ok(parsed.hasOwnProperty('grainstore'), "No 'grainstore' version in " + parsed);
          console.log("Grainstore: " + parsed.grainstore);
          assert.ok(parsed.hasOwnProperty('node_mapnik'), "No 'node_mapnik' version in " + parsed);
          console.log("Node-mapnik: " + parsed.node_mapnik);
          assert.ok(parsed.hasOwnProperty('mapnik'), "No 'mapnik' version in " + parsed);
          console.log("Mapnik: " + parsed.mapnik);
          // TODO: check actual versions ?
          done();
        });
    });
});

suite.skip('server old_api', function() {

    var redis_client = redis.createClient(global.environment.redis.port);

    var test_database = _.template(global.environment.postgres_auth_user, {user_id:1}) + '_db';

    // A couple of styles to use during testing
    var test_style_black_210 = "#test_table{marker-fill:black;marker-line-color:red;marker-width:20}";

    test("get'ing a tile with url specified 2.1.0 style (lzma version)",  function(done){
        var qo = {
          style: test_style_black_210,
          style_version: '2.1.0',
          cache_buster: 5
        };
        step (
          function compressQuery () {
            //console.log("Compressing starts");
            helper.lzma_compress_to_base64(JSON.stringify(qo), 1, this);
          },
          function sendRequest(err, lzma) {
            if ( err ) throw err;
            var next = this;
            //console.log("Compressing ends: " + typeof(lzma) + " - " + lzma);
            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/test_table/15/16046/12354.png?lzma=' + encodeURIComponent(lzma),
                method: 'GET',
                encoding: 'binary'
            },{}, function(res) { next(null, res); });
          },
          function checkResponse(err, res) {
            if ( err ) throw err;
            var next = this;
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',
                IMAGE_EQUALS_TOLERANCE_PER_MIL, function(err/*, similarity*/) {
                    next(err);
                });
          },
          function finish(err) {
            done(err);
          }
        );
    });

    test("uses sqlapi to figure source data of query", function(done){
        var qo = {
          sql: "SELECT g.cartodb_id, g.codineprov, t.the_geom_webmercator" +
              " FROM gadm4 g, test_table t" +
              " WHERE g.cartodb_id = t.cartodb_id",
          map_key: 1234
        };
        step(
          function sendRequest() {
            var next = this;
            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/gadm4/6/31/24.png?' + querystring.stringify(qo),
                method: 'GET'
            },{}, function(res) { next(null, res); });
          },
          function checkResponse(err, res) {
            if ( err ) throw err;
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            var cc = res.headers['x-cache-channel'];
            assert(cc, 'Missing X-Cache-Channel');
            var dbname = test_database;
            assert.equal(cc.substring(0, dbname.length), dbname);
            if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
                var jsonquery = cc.substring(dbname.length + 1);
                var sentquery = JSON.parse(jsonquery);
                assert.equal(sentquery.api_key, qo.map_key);
                assert.equal(sentquery.q, 'SELECT CDB_QueryTables($windshaft$' + qo.sql + '$windshaft$)');
            }
            return null;
          },
          function finish(err) {
            done(err);
          }
        );
    });

    if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
    test("requests to skip cache on sqlapi error", function(done){
        var qo = {
          sql: "SELECT g.cartodb_id, g.codineprov, t.the_geom_webmercator, 'SQLAPIERROR' is not null" +
              " FROM gadm4 g, test_table t" +
              " WHERE g.cartodb_id = t.cartodb_id",
          map_key: 1234
        };
        step(
          function sendRequest() {
            var next = this;
            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/gadm4/6/31/24.png?' + querystring.stringify(qo),
                method: 'GET'
            },{}, function(res) { next(null, res); });
          },
          function checkResponse(err, res) {
            if ( err ) throw err;
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            // does NOT send an x-cache-channel
            assert.ok(!res.headers.hasOwnProperty('x-cache-channel'));
            return null;
          },
          function finish(err) {
            done(err);
          }
        );
    });
    }

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/115
    test.skip("get'ing tile with not-strictly-valid style", function(done) {
        var style = querystring.stringify({style: '#test_table{line-color:black}}', style_version: '2.0.0'});
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table/0/0/0.png?' + style, // madrid
            method: 'GET',
            encoding: 'binary'
        },{}, function(res){
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          done();
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Tear down
    //
    /////////////////////////////////////////////////////////////////////////////////

    suiteTeardown(function(done) {
        // This test will add map_style records, like
        // 'map_style|null|publicuser|my_table',
        redis_client.keys("map_style|*", function(err, matches) {
            redis_client.del(matches, function() {
                done();
            });
        });
    });
    
});
