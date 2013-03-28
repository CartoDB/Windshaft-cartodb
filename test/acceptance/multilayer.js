var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
var semver      = require('semver');
var mapnik      = require('mapnik');
var Step        = require('step');
var SQLAPIEmu   = require(__dirname + '/../support/SQLAPIEmu.js');

require(__dirname + '/../support/test_helper');

var windshaft_fixtures = __dirname + '/../../node_modules/windshaft/test/fixtures';

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('multilayer', function() {

    var redis_client = redis.createClient(global.environment.redis.port);
    var sqlapi_server;

    suiteSetup(function(done){
      sqlapi_server = new SQLAPIEmu(global.environment.sqlapi.port, done);
    });

    test("layergroup with 2 layers, each with its style", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator from test_table limit 2',
               cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }', 
               cartocss_version: '2.0.1' 
             } },
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, -5e6, 0) as the_geom_webmercator from test_table limit 2 offset 2',
               cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
               cartocss_version: '2.0.2' 
             } }
        ]
      };

      var expected_token = "d442ca6d3ece793b9c16c02a1d1ea5f2";
      Step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              var expectedBody = { layergroupid: expected_token };
              // check last modified
              var qTables = JSON.stringify({
                'q': 'SELECT CDB_QueryTables($windshaft$'
                    + layergroup.layers[0].options.sql + ';'
                    + layergroup.layers[1].options.sql 
                    + '$windshaft$)'
              });
              expectedBody.last_updated = JSON.stringify({
                'q': 'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max '
                    + 'FROM CDB_TableMetadata m WHERE m.tabname::name = any (\'{'
                    + qTables + '}\')'
              });
              if ( expected_token ) {
                //assert.equal(parsedBody.layergroupid, expectedBody.layergroupid);
                //assert.equal(parsedBody.last_updated, expectedBody.last_updated);
                assert.deepEqual(parsedBody, expectedBody);
              }
              else expected_token = parsedBody.layergroupid;
              next(null, res);
          });
        },
        function do_get_tile(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token + '/0/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc); 
              var dbname = 'cartodb_test_user_1_db'
              assert.equal(cc.substring(0, dbname.length), dbname);
              var jsonquery = cc.substring(dbname.length+1);
              var sentquery = JSON.parse(jsonquery);
              assert.equal(sentquery.q, 'SELECT CDB_QueryTables($windshaft$'
                + layergroup.layers[0].options.sql + ';'
                + layergroup.layers[1].options.sql 
                + '$windshaft$)');

              assert.imageEqualsFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.png', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function do_get_grid_layer0(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token
                 + '/layer0/0/0/0.grid.json?interactivity=cartodb_id',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "text/javascript; charset=utf-8; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.layer0.grid.json', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function do_get_grid_layer1(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token
                 + '/layer1/0/0/0.grid.json?interactivity=cartodb_id',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "text/javascript; charset=utf-8; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.layer1.grid.json', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function finish(err) {
          var errors = [];
          if ( err ) {
            errors.push(err.message);
            console.log("Error: " + err);
          }
          redis_client.keys("map_style|cartodb_test_user_1_db|~" + expected_token, function(err, matches) {
              if ( err ) errors.push(err.message);
              assert.equal(matches.length, 1, "Missing expected token " + expected_token + " from redis: " + matches);
              redis_client.del(matches, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) done(new Error(errors));
                else done(null);
              });
          });
        }
      );
    });


    test("layergroup can hold substitution tokens", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, '
                  + 'ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fill:red; }', 
               cartocss_version: '2.0.1' 
             } }
        ]
      };

      var expected_token; // = "d442ca6d3ece793b9c16c02a1d1ea5f2";
      Step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              var expectedBody = { layergroupid: expected_token };
              // check last modified
              var qTables = JSON.stringify({
                'q': 'SELECT CDB_QueryTables($windshaft$'
                    + layergroup.layers[0].options.sql
                    + '$windshaft$)'
              });
              expectedBody.last_updated = JSON.stringify({
                'q': 'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max '
                    + 'FROM CDB_TableMetadata m WHERE m.tabname::name = any (\'{'
                    + qTables + '}\')'
              });
              if ( expected_token ) {
                //assert.equal(parsedBody.layergroupid, expectedBody.layergroupid);
                //assert.equal(parsedBody.last_updated, expectedBody.last_updated);
                assert.deepEqual(parsedBody, expectedBody);
              }
              else expected_token = parsedBody.layergroupid;
              next(null, res);
          });
        },
        function do_get_tile1(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token + '/1/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc); 
              var dbname = 'cartodb_test_user_1_db'
              assert.equal(cc.substring(0, dbname.length), dbname);
              var jsonquery = cc.substring(dbname.length+1);
              var sentquery = JSON.parse(jsonquery);
              assert.equal(sentquery.q, 'SELECT CDB_QueryTables($windshaft$'
                + layergroup.layers[0].options.sql
                + '$windshaft$)');

              assert.imageEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.png', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function do_get_tile4(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token + '/4/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc); 
              var dbname = 'cartodb_test_user_1_db'
              assert.equal(cc.substring(0, dbname.length), dbname);
              var jsonquery = cc.substring(dbname.length+1);
              var sentquery = JSON.parse(jsonquery);
              assert.equal(sentquery.q, 'SELECT CDB_QueryTables($windshaft$'
                + layergroup.layers[0].options.sql
                + '$windshaft$)');

              assert.imageEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.png', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function do_get_grid1(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token
                 + '/layer0/1/0/0.grid.json?interactivity=cartodb_id',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "text/javascript; charset=utf-8; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.grid.json', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function do_get_grid4(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup/' + expected_token
                 + '/layer0/4/0/0.grid.json?interactivity=cartodb_id',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "text/javascript; charset=utf-8; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.grid.json', 2,
                function(err, similarity) {
                  next(err);
              });
          });
        },
        function finish(err) {
          var errors = [];
          if ( err ) {
            errors.push(err.message);
            console.log("Error: " + err);
          }
          redis_client.keys("map_style|cartodb_test_user_1_db|~" + expected_token, function(err, matches) {
              if ( err ) errors.push(err.message);
              assert.equal(matches.length, 1, "Missing expected token " + expected_token + " from redis: " + matches);
              redis_client.del(matches, function(err) {
                if ( err ) errors.push(err.message);
                if ( errors.length ) done(new Error(errors));
                else done(null);
              });
          });
        }
      );
    });

    suiteTeardown(function(done) {
        // This test will add map_style records, like
        // 'map_style|null|publicuser|my_table',
        redis_client.keys("map_style|*", function(err, matches) {
            redis_client.del(matches, function(err) {
              sqlapi_server.close(done);
            });
        });
    });
    
});

