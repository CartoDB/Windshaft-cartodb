var assert      = require('../support/assert');
var _           = require('underscore');
var redis       = require('redis');
var step        = require('step');
var strftime    = require('strftime');
var redis_stats_db = 5;

var mapnik = require('windshaft').mapnik;
var semver = require('semver');

var helper = require(__dirname + '/../support/test_helper');
var LayergroupToken = require('../../lib/cartodb/models/layergroup-token');

var windshaft_fixtures = __dirname + '/../../node_modules/windshaft/test/fixtures';

var IMAGE_EQUALS_TOLERANCE_PER_MIL = 20;
var IMAGE_EQUALS_HIGHER_TOLERANCE_PER_MIL = 25;

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

var QueryTables = require('cartodb-query-tables');

['/api/v1/map', '/user/localhost/api/v1/map'].forEach(function(layergroup_url) {

var suiteName = 'multilayer:postgres=layergroup_url=' + layergroup_url;
describe(suiteName, function() {


    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        helper.deleteRedisKeys(keysToDelete, done);
    });

    var cdbQueryTablesFromPostgresEnabledValue = true;

    var expected_last_updated_epoch = 1234567890123; // this is hard-coded into SQLAPIEmu
    var expected_last_updated = new Date(expected_last_updated_epoch).toISOString();

    var test_user = _.template(global.environment.postgres_auth_user, {user_id:1});
    var test_database = test_user + '_db';

    it("layergroup with 2 layers, each with its style", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator' +
                   ' from test_table limit 2',
               cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
               cartocss_version: '2.0.1',
               interactivity: 'cartodb_id'
             } },
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, -5e6, 0) as the_geom_webmercator' +
                   ' from test_table limit 2 offset 2',
               cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }',
               cartocss_version: '2.0.2',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token; // = "e34dd7e235138a062f8ba7ad051aa3a7";
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              assert.equal(parsedBody.last_updated, expected_last_updated);
              assert.equal(res.headers['x-layergroup-id'], parsedBody.layergroupid);
              expected_token = parsedBody.layergroupid;
              next(null, res);
          });
        },
        function do_get_tile(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check Cache-Control
              var cc = res.headers['cache-control'];
              assert.equal(cc, 'public,max-age=31536000');  // 1 year

              // Check X-Cache-Channel
              cc = res.headers['x-cache-channel'];
              assert.ok(cc);
              var dbname = test_database;
              assert.equal(cc.substring(0, dbname.length), dbname);
              if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
                  var jsonquery = cc.substring(dbname.length + 1);
                  var sentquery = JSON.parse(jsonquery);
                  var expectedQuery = [
                      layergroup.layers[0].options.sql, ';',
                      layergroup.layers[1].options.sql
                  ].join('');
                  assert.equal(sentquery.q, 'WITH querytables AS ( SELECT * FROM CDB_QueryTables($windshaft$' +
                      expectedQuery +
                      '$windshaft$) as tablenames )' +
                      ' SELECT (SELECT tablenames FROM querytables), EXTRACT(EPOCH FROM max(updated_at)) as max' +
                      ' FROM CDB_TableMetadata m' +
                      ' WHERE m.tabname = any ((SELECT tablenames from querytables)::regclass[])');
              }

              assert.imageBufferIsSimilarToFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.png',
                  IMAGE_EQUALS_HIGHER_TOLERANCE_PER_MIL, function(err/*, similarity*/) {
                      next(err);
                  }
              );
          });
        },
        // See https://github.com/CartoDB/Windshaft-cartodb/issues/170
        function do_get_tile_nosignature(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + '/localhost@' + expected_token + ':cb0/0/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 403, res.statusCode + ':' + res.body);
              var parsed = JSON.parse(res.body);
              var msg = parsed.errors[0];
              assert.ok(msg.match(/permission denied/i), msg);
              next(err);
          });
        },
        function do_get_grid_layer0(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/0/0/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.layer0.grid.json', 2,
                function(err/*, similarity*/) {
                  next(err);
              });
          });
        },
        function do_get_grid_layer1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/1/0/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_table_0_0_0_multilayer1.layer1.grid.json', 2,
                function(err/*, similarity*/) {
                  next(err);
              });
          });
        },
        function finish(err) {
            keysToDelete['map_cfg|' + LayergroupToken.parse(expected_token).token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;
            done(err);
        }
      );
    });


    describe('server-metadata', function() {
        var serverMetadata;
        beforeEach(function() {
            serverMetadata = global.environment.serverMetadata;
            global.environment.serverMetadata = { cdn_url : { http:'test', https: 'tests' } };
        });

        afterEach(function() {
            global.environment.serverMetadata = serverMetadata;
        });

        it("should include serverMedata in the response", function(done) {
          var layergroup =  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator' +
                       ' from test_table limit 2',
                   cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                   cartocss_version: '2.0.1'
                 } }
            ]
          };

          step(
            function do_create_get()
            {
              var next = this;
              assert.response(server, {
                  url: layergroup_url + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
                  method: 'GET',
                  headers: {host: 'localhost'}
              }, {}, function(res, err) { next(err, res); });
            },
            function do_check_create(err, res) {
              var parsed = JSON.parse(res.body);
              keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
              keysToDelete['user:localhost:mapviews:global'] = 5;
              assert.ok(_.isEqual(parsed.cdn_url, global.environment.serverMetadata.cdn_url));
              done();
            }
          );
        });

    });


    it("get creation requests has cache", function(done) {

        var layergroup =  {
            version: '1.0.0',
            layers: [
                { options: {
                    sql: 'select cartodb_id, the_geom_webmercator from test_table',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.0.1',
                    interactivity: 'cartodb_id'
                } },
                { options: {
                    sql: 'select cartodb_id, the_geom_webmercator from test_table_2',
                    cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }',
                    cartocss_version: '2.0.2',
                    interactivity: 'cartodb_id'
                } }
            ]
        };

      var expected_token;
      step(
        function do_create_get()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
              method: 'GET',
              headers: {host: 'localhost'}
          }, {}, function(res, err) { next(err, res); });
        },
        function do_check_create(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 200, res.body);
          var parsedBody = JSON.parse(res.body);
          expected_token = parsedBody.layergroupid.split(':')[0];
          helper.checkCache(res);
          helper.checkSurrogateKey(res, new QueryTables.DatabaseTablesEntry([
            {dbname: "test_windshaft_cartodb_user_1_db", table_name: "test_table", schema_name: "public"},
            {dbname: "test_windshaft_cartodb_user_1_db", table_name: "test_table_2", schema_name: "public"},
          ]).key().join(' '));


          keysToDelete['map_cfg|' + expected_token] = 0;
          keysToDelete['user:localhost:mapviews:global'] = 5;

          done();
        }
      );
    });

    it("get creation has no cache if sql is bogus", function(done) {
        var layergroup =  {
            version: '1.0.0',
            layers: [
                { options: {
                    sql: 'select bogus(0,0) as the_geom_webmercator',
                    cartocss: '#layer { polygon-fill: red; }',
                    cartocss_version: '2.0.1'
                } }
            ]
        };
        assert.response(server, {
            url: layergroup_url + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
            method: 'GET',
            headers: {host: 'localhost'}
        }, {}, function(res) {
            assert.notEqual(res.statusCode, 200);
            helper.checkNoCache(res);
            done();
        });
    });

    it("get creation has no cache if cartocss is not valid", function(done) {
        var layergroup =  {
            version: '1.0.0',
            layers: [
                { options: {
                    sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator' +
                        ' from test_table limit 2',
                    cartocss: '#layer { invalid-rule:red; }',
                    cartocss_version: '2.0.1'
                } }
            ]
        };
        assert.response(server, {
            url: layergroup_url + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
            method: 'GET',
            headers: {host: 'localhost'}
        }, {}, function(res) {
            assert.notEqual(res.statusCode, 200);
            helper.checkNoCache(res);
            done();
        });
    });

    it("layergroup can hold substitution tokens", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!))' +
                   ' as the_geom_webmercator from test_table limit 1',
               cartocss: '#layer { polygon-fill:red; }',
               cartocss_version: '2.0.1',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token; //  = "6d8e4ad5458e2d25cf0eef38e38717a6";
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              assert.equal(parsedBody.last_updated, expected_last_updated);
              if ( expected_token ) {
                assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
              }
              else {
                  expected_token = parsedBody.layergroupid.split(':')[0];
              }
              next(null, res);
          });
        },
        function do_get_tile1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb10/1/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc);
              var dbname = test_database;
              assert.equal(cc.substring(0, dbname.length), dbname);
              if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
                  var jsonquery = cc.substring(dbname.length + 1);
                  var sentquery = JSON.parse(jsonquery);
                  var expectedQuery = layergroup.layers[0].options.sql
                      .replace(/!bbox!/g, 'ST_MakeEnvelope(0,0,0,0)')
                      .replace(/!pixel_width!/g, '1')
                      .replace(/!pixel_height!/g, '1');
                  assert.equal(sentquery.q, 'WITH querytables AS ( SELECT * FROM CDB_QueryTables($windshaft$' +
                      expectedQuery +
                      '$windshaft$) as tablenames )' +
                      ' SELECT (SELECT tablenames FROM querytables), EXTRACT(EPOCH FROM max(updated_at)) as max' +
                      ' FROM CDB_TableMetadata m' +
                      ' WHERE m.tabname = any ((SELECT tablenames from querytables)::regclass[])');
              }

              var referenceImagePath = 'test/fixtures/test_multilayer_bbox.png';
              assert.imageBufferIsSimilarToFile(res.body, referenceImagePath, IMAGE_EQUALS_TOLERANCE_PER_MIL,
                function(err/*, similarity*/) {
                  next(err);
              });
          });
        },
        function do_get_tile4(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb11/4/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc);
              var dbname = test_database;
              assert.equal(cc.substring(0, dbname.length), dbname);
              if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
                  var jsonquery = cc.substring(dbname.length + 1);
                  var sentquery = JSON.parse(jsonquery);
                  var expectedQuery = layergroup.layers[0].options.sql
                      .replace('!bbox!', 'ST_MakeEnvelope(0,0,0,0)')
                      .replace('!pixel_width!', '1')
                      .replace('!pixel_height!', '1');
                  assert.equal(sentquery.q, 'WITH querytables AS ( SELECT * FROM CDB_QueryTables($windshaft$' +
                      expectedQuery +
                      '$windshaft$) as tablenames )' +
                      ' SELECT (SELECT tablenames FROM querytables), EXTRACT(EPOCH FROM max(updated_at)) as max' +
                      ' FROM CDB_TableMetadata m' +
                      ' WHERE m.tabname = any ((SELECT tablenames from querytables)::regclass[])');
              }

              var referenceImagePath = 'test/fixtures/test_multilayer_bbox.png';
              assert.imageBufferIsSimilarToFile(res.body, referenceImagePath, IMAGE_EQUALS_TOLERANCE_PER_MIL,
                function(err/*, similarity*/) {
                  next(err);
              });
          });
        },
        function do_get_grid1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/0/1/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.grid.json', 2,
                function(err/*, similarity*/) {
                  next(err);
              });
          });
        },
        function do_get_grid4(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/0/4/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
              assert.utfgridEqualsFile(res.body, 'test/fixtures/test_multilayer_bbox.grid.json', 2, next);
          });
        },
        function finish(err) {
            keysToDelete['map_cfg|' + expected_token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;

            done(err);
        }
      );
    });

    it("layergroup creation raises mapviews counter", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, !pixel_height! as h,' +
                   ' ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fill:red; }',
               cartocss_version: '2.0.1'
             } }
        ]
      };
      var statskey = "user:localhost:mapviews";
      var redis_stats_client = redis.createClient(global.environment.redis.port);
      var expected_token; // will be set on first post and checked on second
      var now = strftime("%Y%m%d", new Date());
      step(
        function clean_stats()
        {
          var next = this;
          redis_stats_client.select(redis_stats_db, function(err) {
            if ( err ) {
                next(err);
            }
            else {
                redis_stats_client.del(statskey+':global', next);
            }
          });
        },
        function do_post_1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url,
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
            assert.ifError(err);
          assert.equal(val, 1, "Expected score of " + now + " in " + statskey + ":global to be 1, got " + val);
          redis_stats_client.zscore(statskey+':stat_tag:random_tag', now, this);
        },
        function check_tag_stats_1_do_post_2(err, val) {
          assert.ifError(err);
          assert.equal(val, 1, "Expected score of " + now + " in " + statskey + ":stat_tag:" + layergroup.stat_tag +
              " to be 1, got " + val);
          var next = this;
          assert.response(server, {
              url: layergroup_url,
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
            assert.ifError(err);
          assert.equal(val, 2, "Expected score of " + now + " in " +  statskey + ":global to be 2, got " + val);
          redis_stats_client.zscore(statskey+':stat_tag:' + layergroup.stat_tag, now, this);
        },
        function check_tag_stats_2(err, val)
        {
            assert.ifError(err);
          assert.equal(val, 2, "Expected score of " + now + " in " + statskey + ":stat_tag:" + layergroup.stat_tag +
              " to be 2, got " + val);
          return 1;
        },
        function finish(err) {
            if ( err ) {
              return done(err);
            }
            // strip epoch
            expected_token = expected_token.split(':')[0];
            keysToDelete['map_cfg|' + expected_token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;
            keysToDelete[statskey+':stat_tag:'+layergroup.stat_tag] = 5;
            done();
        }
      );
    });

    it("layergroup creation fails if CartoCSS is bogus", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select 1 as cartodb_id, !pixel_height! as h,' +
                   'ST_Buffer(!bbox!, -32*greatest(!pixel_width!,!pixel_height!)) as the_geom_webmercator',
               cartocss: '#layer { polygon-fit:red; }',
               cartocss_version: '2.0.1'
             } }
        ]
      };
      assert.response(server, {
          url: layergroup_url,
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

    // Also tests that server doesn't crash:
    // see http://github.com/CartoDB/Windshaft-cartodb/issues/109
    it("layergroup creation fails if sql is bogus", function(done) {
      var layergroup =  {
        stat_tag: 'random_tag',
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select bogus(0,0) as the_geom_webmercator',
               cartocss: '#layer { polygon-fill:red; }',
               cartocss_version: '2.0.1'
             } }
        ]
      };
      assert.response(server, {
          url: layergroup_url,
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(layergroup)
      }, {}, function(res) {
          assert.equal(res.statusCode, 400, res.statusCode + ": " + res.body);
          var parsed = JSON.parse(res.body);
          var msg = parsed.errors[0];
          assert.ok(msg.match(/bogus.*exist/), msg);
          helper.checkNoCache(res);
          done();
      });
    });

    it("layergroup with 2 private-table layers", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select * from test_table_private_1 where cartodb_id=1',
               cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
               cartocss_version: '2.1.0',
               interactivity: 'cartodb_id'
             } },
           { options: {
               sql: 'select * from test_table_private_1 where cartodb_id=2',
               cartocss: '#layer { marker-fill:blue; marker-allow-overlap:true; }',
               cartocss_version: '2.1.0',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token; // = "b4ed64d93a411a59f330ab3d798e4009";
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url + '?map_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              assert.equal(parsedBody.last_updated, expected_last_updated);
              if ( expected_token ) {
                assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
              }
              else {
                  expected_token = parsedBody.layergroupid.split(':')[0];
              }
              next(null, res);
          });
        },
        function do_get_tile(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png?map_key=1234',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "image/png");

              // Check X-Cache-Channel
              var cc = res.headers['x-cache-channel'];
              assert.ok(cc);
              var dbname = test_database;
              assert.equal(cc.substring(0, dbname.length), dbname);
              next(err);
          });
        },
        function do_get_grid_layer0(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/0/0/0/0.grid.json?map_key=1234',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              next(err);
          });
        },
        function do_get_grid_layer1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/1/0/0/0.grid.json?map_key=1234',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.equal(res.headers['content-type'], "application/json; charset=utf-8");
              next(err);
          });
        },
        function do_get_tile_unauth(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) {
              assert.equal(res.statusCode, 403);
              var re = new RegExp('permission denied');
              assert.ok(res.body.match(re), 'No "permission denied" error: ' + res.body);
              next(err);
          });
        },
        function do_get_grid_layer0_unauth(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/0/0/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 403);
              var re = new RegExp('permission denied');
              assert.ok(res.body.match(re), 'No "permission denied" error: ' + res.body);
              next(err);
          });
        },
        function do_get_grid_layer1_unauth(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + '/1/0/0/0.grid.json',
              headers: {host: 'localhost' },
              method: 'GET'
          }, {}, function(res) {
              assert.equal(res.statusCode, 403);
              var re = new RegExp('permission denied');
              assert.ok(res.body.match(re), 'No "permission denied" error: ' + res.body);
              next(err);
          });
        },
        function finish(err) {
            keysToDelete['map_cfg|' + expected_token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;

            done(err);
        }
      );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/152
    it("x-cache-channel still works for GETs after tiler restart", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select * from test_table where cartodb_id=1',
               cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
               cartocss_version: '2.1.0',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      var expected_token; // = "b4ed64d93a411a59f330ab3d798e4009";
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url + '?map_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res, err) { next(err, res); });
        },
        function check_post(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 200, res.body);
          var parsedBody = JSON.parse(res.body);
          assert.equal(parsedBody.last_updated, expected_last_updated);
          if ( expected_token ) {
            assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
          }
          else {
              expected_token = parsedBody.layergroupid.split(':')[0];
          }
          return null;
        },
        function do_get0(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png?map_key=1234',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res, err) { next(err, res); });
        },
        function do_check0(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 200, res.body);
          assert.equal(res.headers['content-type'], "image/png");

          // Check X-Cache-Channel
          var cc = res.headers['x-cache-channel'];
          assert.ok(cc, "Missing X-Cache-Channel");
          var dbname = test_database;
          assert.equal(cc.substring(0, dbname.length), dbname);
          return null;
        },
        function do_restart_server(err/*, res*/) {
            assert.ifError(err);
          // hack simulating restart...
          server = new CartodbWindshaft(serverOptions);
          return null;
        },
        function do_get1(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png?map_key=1234',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res, err) { next(err, res); });
        },
        function do_check1(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 200, res.body);
          assert.equal(res.headers['content-type'], "image/png");

          // Check X-Cache-Channel
          var cc = res.headers['x-cache-channel'];
          assert.ok(cc, "Missing X-Cache-Channel on restart");
          var dbname = test_database;
          assert.equal(cc.substring(0, dbname.length), dbname);
          return null;
        },
        function finish(err) {
            keysToDelete['map_cfg|' + expected_token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;

            done(err);
        }
      );
    });

    // https://github.com/cartodb/Windshaft-cartodb/issues/81
    it("invalid text-name in CartoCSS", function(done) {

      var layergroup =  {
        version: '1.0.1',
        layers: [
           { options: {
               sql: "select 1 as cartodb_id, 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator",
               cartocss: '#sample { text-name: cartodb_id; text-face-name: "Dejagnu"; }',
               cartocss_version: '2.1.0'
             } }
        ]
      };

      assert.response(server, {
          url: layergroup_url,
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(layergroup)
      }, {}, function(res) {
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.equal(parsed.errors.length, 1);
          var errmsg = parsed.errors[0];
          assert.ok(errmsg.match(/text-face-name.*Dejagnu/), parsed.errors.toString());
          done();
      });
    });

    it("quotes CartoCSS", function(done) {

      var layergroup =  {
        version: '1.0.1',
        layers: [
           { options: {
               sql: "select 'single''quote' as n, 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator",
               cartocss: '#s [n="single\'quote" ] { marker-fill:red; }',
               cartocss_version: '2.1.0'
             } },
           { options: {
               sql: "select 'double\"quote' as n, 'SRID=3857;POINT(2 0)'::geometry as the_geom_webmercator",
               cartocss: '#s [n="double\\"quote" ] { marker-fill:red; }',
               cartocss_version: '2.1.0'
             } }
        ]
      };

      assert.response(server, {
          url: layergroup_url,
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(layergroup)
      }, {}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
          keysToDelete['user:localhost:mapviews:global'] = 5;
          done();
      });
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/87
    it("exponential notation in CartoCSS filter values", function(done) {
      var layergroup =  {
        version: '1.0.1',
        layers: [
           { options: {
               sql: "select .4 as n, 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator",
               cartocss: '#s [n<=.2e-2] { marker-fill:red; }',
               cartocss_version: '2.1.0'
             } }
        ]
      };
      assert.response(server, {
          url: layergroup_url,
          method: 'POST',
          headers: {host: 'localhost', 'Content-Type': 'application/json' },
          data: JSON.stringify(layergroup)
      }, {}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
          keysToDelete['user:localhost:mapviews:global'] = 5;
          done();
      });
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/93
    if (semver.satisfies(mapnik.versions.mapnik, '2.3.x')) {
        it("accepts unused directives", function(done) {
          var layergroup =  {
            version: '1.0.0',
            layers: [
               { options: {
                   sql: "select 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator",
                   cartocss: '#layer { point-transform:"scale(20)"; }',
                   cartocss_version: '2.0.1'
                 } }
            ]
          };
          var expected_token; // = "e34dd7e235138a062f8ba7ad051aa3a7";
          step(
            function do_post()
            {
              var next = this;
              assert.response(server, {
                  url: layergroup_url,
                  method: 'POST',
                  headers: {host: 'localhost', 'Content-Type': 'application/json' },
                  data: JSON.stringify(layergroup)
              }, {}, function(res) {
                  assert.equal(res.statusCode, 200, res.body);
                  var parsedBody = JSON.parse(res.body);
                  if ( expected_token ) {
                    assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
                    assert.equal(res.headers['x-layergroup-id'], parsedBody.layergroupid);
                  }
                  else {
                    var token_components = parsedBody.layergroupid.split(':');
                    expected_token = token_components[0];
                    expected_last_updated_epoch = token_components[1];
                  }
                  next(null, res);
              });
            },
            function do_get_tile(err)
            {
                assert.ifError(err);
              var next = this;
              assert.response(server, {
                  url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png',
                  method: 'GET',
                  headers: {host: 'localhost' },
                  encoding: 'binary'
              }, {}, function(res) {
                  assert.equal(res.statusCode, 200, res.body);
                  assert.equal(res.headers['content-type'], "image/png");
                  assert.imageBufferIsSimilarToFile(res.body, windshaft_fixtures + '/test_default_mapnik_point.png',
                      IMAGE_EQUALS_TOLERANCE_PER_MIL, function(err/*, similarity*/) {
                          next(err);
                      }
                  );
              });
            },
            function finish(err) {
                keysToDelete['user:localhost:mapviews:global'] = 5;
                keysToDelete['map_cfg|' + expected_token] = 0;

                done(err);
            }
          );
        });
    }

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/91
    // and https://github.com/CartoDB/Windshaft-cartodb/issues/38
    it("tiles for private tables can be fetched with api_key", function(done) {
      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: "select * from test_table_private_1 LIMIT 0",
               cartocss: '#layer { marker-fill:red; }',
               cartocss_version: '2.0.1'
             } }
        ]
      };
      var expected_token; // = "e34dd7e235138a062f8ba7ad051aa3a7";
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url + '?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) { next(null, res); });
        },
        function check_result(err, res) {
            assert.ifError(err);
          var next = this;
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          var parsedBody = JSON.parse(res.body);
          if ( expected_token ) {
            assert.equal(parsedBody.layergroupid, expected_token + ':' + expected_last_updated_epoch);
            assert.equal(res.headers['x-layergroup-id'], parsedBody.layergroupid);
          }
          else {
            var token_components = parsedBody.layergroupid.split(':');
            expected_token = token_components[0];
            expected_last_updated_epoch = token_components[1];
          }
          next(null, res);
        },
        function do_get_tile(err)
        {
            assert.ifError(err);
          var next = this;
          assert.response(server, {
              url: layergroup_url + "/" + expected_token + ':cb0/0/0/0.png?api_key=1234',
              method: 'GET',
              headers: {host: 'localhost' },
              encoding: 'binary'
          }, {}, function(res) { next(null, res); });
        },
        function check_get_tile(err, res) {
            if (err) {
                return done(err);
            }
            assert.equal(res.statusCode, 200, res.body);
            keysToDelete['user:localhost:mapviews:global'] = 5;
            keysToDelete['map_cfg|' + expected_token] = 0;
            done(err);
        }
      );
    });

    // SQL strings can be of arbitrary length, when using POST
    // See https://github.com/CartoDB/Windshaft-cartodb/issues/111
    it("sql string can be very long", function(done){
      var long_val = 'pretty';
      for (var i=0; i<1024; ++i) {
          long_val += ' long';
      }
      long_val += ' string';
      var sql = "SELECT ";
      for (i=0; i<16; ++i) {
        sql += "'" + long_val + "'::text as pretty_long_field_name_" + i + ", ";
      }
      sql += "cartodb_id, the_geom_webmercator FROM gadm4 g";
      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: sql,
               cartocss: '#layer { marker-fill:red; }',
               cartocss_version: '2.0.1'
             } }
        ]
      };
      var expected_token;
      step(
        function do_post()
        {
          var data = JSON.stringify(layergroup);
          assert.ok(data.length > 1024*64);
          var next = this;
          assert.response(server, {
              url: layergroup_url + '?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: data
          }, {}, function(res) { next(null, res); });
        },
        function check_result(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          var parsedBody = JSON.parse(res.body);
          var token_components = parsedBody.layergroupid.split(':');
          expected_token = token_components[0];
          return null;
        },
        function cleanup(err) {
            if (err) {
                return done(err);
            }
            keysToDelete['user:localhost:mapviews:global'] = 5;
            keysToDelete['map_cfg|' + expected_token] = 0;

            done(err);
        }
      );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/133
    it.skip("MapConfig with mapnik layer and no cartocss", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: 'select cartodb_id, ST_Translate(the_geom_webmercator, 5e6, 0) as the_geom_webmercator' +
                   ' from test_table limit 2',
               interactivity: 'cartodb_id'
             } }
        ]
      };

      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res, err) { next(err, res); });
        },
        function check_post(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.errors, 'Missing "errors" in response: ' + JSON.stringify(parsed));
          assert.equal(parsed.errors.length, 1);
          var msg = parsed.errors[0];
          assert.equal(msg, 'Missing cartocss for layer 0 options');
          return null;
        },
        function finish(err) {
          done(err);
        }
      );
    });

    if (!cdbQueryTablesFromPostgresEnabledValue) { // only test if it was using the SQL API
    // See https://github.com/CartoDB/Windshaft-cartodb/issues/167
    it("lack of response from sql-api will result in a timeout", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [
           { options: {
               sql: "select *, 'SQLAPINOANSWER' from test_table",
               cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
               cartocss_version: '2.1.0'
             } }
        ]
      };

      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res, err) { next(err, res); });
        },
        function check_post(err, res) {
            assert.ifError(err);
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.ok(parsed.errors, 'Missing "errors" in response: ' + JSON.stringify(parsed));
          assert.equal(parsed.errors.length, 1);
          var msg = parsed.errors[0];
          assert.ok(msg, /could not fetch source tables/, msg);
          return null;
        },
        function finish(err) {
          done(err);
        }
      );
    });
    }

    var layergroupTtlRequest = {
        url: layergroup_url + '?config=' + encodeURIComponent(JSON.stringify({
            version: '1.0.0',
            layers: [
                { options: {
                    sql: 'select * from test_table limit 2',
                    cartocss: '#layer { marker-fill:red; marker-width:32; marker-allow-overlap:true; }',
                    cartocss_version: '2.0.1'
                } }
            ]
        })),
        method: 'GET',
        headers: {host: 'localhost'}
    };
    var layergroupTtlResponseExpectation = {
        status: 200
    };

    it("cache control for layergroup default value", function(done) {
        global.environment.varnish.layergroupTtl = null;

        assert.response(server, layergroupTtlRequest, layergroupTtlResponseExpectation,
            function(res) {
                assert.equal(res.headers['cache-control'], 'public,max-age=86400,must-revalidate');
                keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });

    it("cache control for layergroup uses configuration for max-age", function(done) {
        var layergroupTtl = 300;
        global.environment.varnish.layergroupTtl = layergroupTtl;

        assert.response(server, layergroupTtlRequest, layergroupTtlResponseExpectation,
            function(res) {
                assert.equal(res.headers['cache-control'], 'public,max-age=' + layergroupTtl + ',must-revalidate');
                keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });


    it("it's not possible to override authorization with a crafted layergroup", function(done) {

        var layergroup =  {
            version: '1.0.0',
            layers: [
                {
                    options: {
                        sql: 'select * from test_table_private_1',
                        cartocss: '#layer { marker-fill:red; }',
                        cartocss_version: '2.3.0',
                        interactivity: 'cartodb_id'
                    }
                }
            ],
            template: {
                auth: {
                    method: "open"
                },
                name: "open"
            }
        };

        assert.response(
            server,
            {
                url: '/api/v1/map?signer=localhost',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(layergroup)
            },
            {
                status: 403
            },
            function(res) {
                assert.ok(res.body.match(/permission denied for relation test_table_private_1/));
                done();
            }
        );
    });

    it('should response to empty layers mapconfig', function(done) {
        var layergroup =  {
            layers: []
        };

        assert.response(
            server,
            {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(layergroup)
            },
            {
                status: 200
            },
            function(res, err) {
                assert.ok(!err);

                var parsedBody = JSON.parse(res.body);
                assert.ok(parsedBody.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });

});

});
