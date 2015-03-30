require(__dirname + '/../support/test_helper');

var assert      = require('../support/assert');
var _           = require('underscore');
var querystring = require('querystring');
var step        = require('step');

var CartodbWindshaft = require('../../lib/cartodb/cartodb_windshaft');
var serverOptions = require('../../lib/cartodb/server_options')();
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

});
