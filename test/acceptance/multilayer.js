var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
var semver      = require('semver');
var mapnik      = require('mapnik');
var Step        = require('step');
var strftime    = require('strftime');
var SQLAPIEmu   = require(__dirname + '/../support/SQLAPIEmu.js');
var redis_stats_db = 5;

require(__dirname + '/../support/test_helper');

var windshaft_fixtures = __dirname + '/../../node_modules/windshaft/test/fixtures';

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('multilayer', function() {

    var redis_client = redis.createClient(global.environment.redis.port);
    var sqlapi_server;
    var expected_last_updated_epoch = 1234567890123; // this is hard-coded into SQLAPIEmu
    var expected_last_updated = new Date(expected_last_updated_epoch).toISOString();

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
               cartocss_version: '2.0.1',
               interactivity: 'cartodb_id'
             } },
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, -5e6, 0) as the_geom_webmercator from test_table limit 2 offset 2',
               cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }', 
               cartocss_version: '2.0.2',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token = "e34dd7e235138a062f8ba7ad051aa3a7";
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
              assert.equal(parsedBody.last_updated, expected_last_updated);
              if ( expected_token ) {
                assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
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
              url: '/tiles/layergroup/' + expected_token + ':cb0/0/0/0.png',
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
                 + '/0/0/0/0.grid.json',
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
                 + '/1/0/0/0.grid.json',
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
               cartocss_version: '2.0.1',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token  = "6d8e4ad5458e2d25cf0eef38e38717a6";
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
              assert.equal(parsedBody.last_updated, expected_last_updated);
              if ( expected_token ) {
                assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
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
              url: '/tiles/layergroup/' + expected_token + ':cb10/1/0/0.png',
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
                    .replace(RegExp('!bbox!', 'g'), 'ST_MakeEnvelope(0,0,0,0)')
                    .replace(RegExp('!pixel_width!', 'g'), '1')
                    .replace(RegExp('!pixel_height!', 'g'), '1')
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
              url: '/tiles/layergroup/' + expected_token + ':cb11/4/0/0.png',
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
                    .replace('!bbox!', 'ST_MakeEnvelope(0,0,0,0)')
                    .replace('!pixel_width!', '1')
                    .replace('!pixel_height!', '1')
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
                 + '/0/1/0/0.grid.json',
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
                 + '/0/4/0/0.grid.json',
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

    test("layergroup creation raises mapviews counter", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, !pixel_height! as h'
                  + 'ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fill:red; }', 
               cartocss_version: '2.0.1' 
             } }
        ]
      };
      var statskey = "user:localhost:mapviews";
      var redis_stats_client = redis.createClient(global.environment.redis.port);
      var expected_token; // will be set on first post and checked on second
      var now = strftime("%Y%m%d", new Date());
      var errors = [];
      Step(
        function clean_stats()
        {
          var next = this;
          redis_stats_client.select(redis_stats_db, function(err) {
            if ( err ) next(err);
            else redis_stats_client.del(statskey+':global', next);
          });
        },
        function do_post_1(err)
        {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              expected_token = JSON.parse(res.body).layergroupid;
              redis_stats_client.zscore(statskey + ":global", now, next);
          });
        },
        function check_global_stats_1(err, val) {
          if ( err ) throw err;
          assert.equal(val, 1, "Expected score of " + now + " in "
              +  statskey + ":global to be 1, got " + val);
          redis_stats_client.zscore(statskey+':stat_tag:random_tag', now, this);
        },
        function check_tag_stats_1_do_post_2(err, val) {
          if ( err ) throw err;
          assert.equal(val, 1, "Expected score of " + now + " in "
              +  statskey + ":stat_tag:" + layergroup.stat_tag + " to be 1, got " + val);
          var next = this;
          assert.response(server, {
              url: '/tiles/layergroup',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(JSON.parse(res.body).layergroupid, expected_token);
              redis_stats_client.zscore(statskey+':global', now, next);
          });
        },
        function check_global_stats_2(err, val)
        {
          if ( err ) throw err;
          assert.equal(val, 2, "Expected score of " + now + " in "
              +  statskey + ":global to be 2, got " + val);
          redis_stats_client.zscore(statskey+':stat_tag:' + layergroup.stat_tag, now, this);
        },
        function check_tag_stats_2(err, val)
        {
          if ( err ) throw err;
          assert.equal(val, 2, "Expected score of " + now + " in "
              +  statskey + ":stat_tag:" + layergroup.stat_tag + " to be 2, got " + val);
          return 1;
        },
        function cleanup_map_style(err) {
          if ( err ) errors.push('' + err);
          var next = this;
          // trip epoch
          expected_token = expected_token.split(':')[0];
          redis_client.keys("map_style|cartodb_test_user_1_db|~" + expected_token, function(err, matches) {
              redis_client.del(matches, next);
          });
        },
        function cleanup_stats(err) {
          if ( err ) errors.push('' + err);
          redis_client.del([statskey+':global', statskey+':stat_tag:'+layergroup.stat_tag], this);
        },
        function finish(err) {
          if ( err ) errors.push('' + err);
          if ( errors.length ) done(new Error(errors.join(',')));
          else done(null);
        }
      );
    });

    test("layergroup creation fails if CartoCSS is bogus", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, !pixel_height! as h'
                  + 'ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fit:red; }', 
               cartocss_version: '2.0.1' 
             } }
        ]
      };
      assert.response(server, {
          url: '/tiles/layergroup',
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(layergroup)
      }, {}, function(res) {
          assert.equal(res.statusCode, 400, res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.errors[0].match(/^style0/));
          assert.ok(parsed.errors[0].match(/Unrecognized rule: polygon-fit/));
          done();
      });
    });

    suiteTeardown(function(done) {

        // This test will add map_style records, like
        // 'map_style|null|publicuser|my_table',
        redis_client.keys("map_style|*", function(err, matches) {
            redis_client.del(matches, function(err) {
              redis_client.select(5, function(err, matches) {
                redis_client.keys("user:localhost:mapviews*", function(err, matches) {
                  redis_client.del(matches, function(err) {
                    sqlapi_server.close(done);
                  });
                });
              });
            });
        });

    });
    
});

