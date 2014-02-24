var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
var semver      = require('semver');
var mapnik      = require('mapnik');
var Step        = require('step');
var http        = require('http');
var SQLAPIEmu   = require(__dirname + '/../support/SQLAPIEmu.js');

var helper = require(__dirname + '/../support/test_helper');

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('server', function() {

    var redis_client = redis.createClient(global.environment.redis.port);
    var sqlapi_server;

    var mapnik_version = global.environment.mapnik_version || mapnik.versions.mapnik;
    var test_database = _.template(global.environment.postgres_auth_user, {user_id:1}) + '_db';
    var default_style;
    if ( semver.satisfies(mapnik_version, '<2.1.0') ) {
      // 2.0.0 default
      default_style = '#<%= table %>{marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}';
    }
    else if ( semver.satisfies(mapnik_version, '<2.2.0') ) {
      // 2.1.0 default
      default_style = '#<%= table %>[mapnik-geometry-type=1] {marker-fill: #FF6600;marker-opacity: 1;marker-width: 16;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}#<%= table %>[mapnik-geometry-type=2] {line-color:#FF6600; line-width:1; line-opacity: 0.7;}#<%= table %>[mapnik-geometry-type=3] {polygon-fill:#FF6600; polygon-opacity: 0.7; line-opacity:1; line-color: #FFFFFF;}';
    }
    else {
      // 2.2.0+ default
      default_style = '#<%= table %>["mapnik::geometry_type"=1] {marker-fill: #FF6600;marker-opacity: 1;marker-width: 16;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}#<%= table %>["mapnik::geometry_type"=2] {line-color:#FF6600; line-width:1; line-opacity: 0.7;}#<%= table %>["mapnik::geometry_type"=3] {polygon-fill:#FF6600; polygon-opacity: 0.7; line-opacity:1; line-color: #FFFFFF;}';
    }

    // A couple of styles to use during testing
    var test_style_black_200 = "#test_table{marker-fill:black;marker-line-color:red;marker-width:10}";
    var test_style_black_210 = "#test_table{marker-fill:black;marker-line-color:red;marker-width:20}";
    
    suiteSetup(function(done){
      sqlapi_server = new SQLAPIEmu(global.environment.sqlapi.port, done);
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET UNSUPPORTED
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    // TODO: I guess this should be a 404 instead...
    test("get call to server returns 200", function(done){
      Step(
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

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET VERSION
    //
    /////////////////////////////////////////////////////////////////////////////////

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

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET STYLE
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    test("get'ing blank style returns default style", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/my_table/style',
            method: 'GET'
        },{
            status: 200,
            headers: { 'X-Cache-Channel': test_database+':my_table' },
        }, function(res) {
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.style, _.template(default_style, {table: 'my_table'}));
            assert.equal(parsed.style_version, mapnik_version);
            done();
        });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/43
    test("get'ing style of private table should fail when unauthenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/style',
            method: 'GET'
        },{
        }, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 400, res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error: 'Sorry, you are unauthorized (permission denied)'});
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });

    // See http://github.com/Vizzuality/Windshaft-cartodb/issues/55
    test("get'ing style of private table should fail on unknown username",
    function(done) {
        assert.response(server, {
            headers: {host: 'unknown_user'},
            url: '/tiles/test_table_private_1/style',
            method: 'GET'
        },{
        }, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's database_name in redis (try CARTODB/script/restore_redis)"});
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });

    test("get'ing style of private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/style?map_key=1234',
            method: 'GET'
        },{
        }, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          var parsed = JSON.parse(res.body);
          var style = _.template(default_style, {table: 'test_table_private_1'});
          assert.equal(parsed.style, style);
          assert.equal(parsed.style_version, mapnik_version); 
          done();
        });
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/94
    test("get'ing unrenderable style", function(done) {
      var base_key = 'map_style|'+test_database+'|issue94';
      var style = '#s{bogus}';
      Step(
        function checkRedis() {
          redis_client.keys(base_key+'*', this);
        },
        function setupRedisBase(err, matches) {
          if ( err ) throw err;
          assert.equal(matches.length, 0,
            'Unexpected redis keys at test start: ' + matches.join("\n"));
          redis_client.set(base_key, 
            JSON.stringify({ style: style }),
          this);
        },
        function getStyle(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/issue94/style',
              method: 'GET'
              }, {}, function(res) { next(null, res); });
        },
        function checkStyle(err, res) {
          if ( err ) throw err;
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          var parsed = JSON.parse(res.body);
          assert.equal(parsed.style, style);
          return null
        },
        function finish(err) {
          done(err);
        }
      );
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // POST STYLE
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    test("post'ing no style returns 400 with errors", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/my_table/style',
            method: 'POST'
        },{
            body: '{"error":"must send style information"}'
        }, function(res) {
          assert.equal(res.statusCode, 400);
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });
    
    test("post'ing bad style returns 400 with error", function(done){
        assert.response(server, {
            url: '/tiles/my_table3/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{backgxxxxxround-color:#fff;}'})
        },{
            status: 400, 
            body: /Unrecognized rule: backgxxxxxround-color/
        }, function() { done(); });
    });

    test("post'ing unparseable style returns 400 with error", function(done){
        assert.response(server, {
            url: '/tiles/my_table3/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{'})
        },{}, function(res) {
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          assert.ok( RegExp(/missing closing/i).test(res.body) );
          done();
        });
    });
    
    test("post'ing multiple bad styles returns 400 with error array", function(done){
        assert.response(server, {
            url: '/tiles/my_table4/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table4{backgxxxxxround-color:#fff;foo:bar}'})
        },{
            status: 400, 
        }, function(res) {
          var parsed = JSON.parse(res.body);
          assert.equal(parsed.length, 2);
          assert.ok( RegExp(/Unrecognized rule: backgxxxxxround-color/).test(parsed[0]) );
          assert.ok( RegExp(/Unrecognized rule: foo/).test(parsed[1]) );
          done();
        });
    });

    test("post'ing good style returns 200", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map { background-color:#fff; }'})
        },{
        }, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            done();
        });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/38
    test("post'ing good style with auth passed as api_key returns 200", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?api_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map { background-color:#fff; }'})
        },{}, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            done();
        });
    });

    // See https://github.com/Vizzuality/cartodb-management/issues/155
    test("post'ing good style with no authentication returns an error", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map { background-color:#fff; }'})
        },{
        }, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          assert.response(server, {
              url: '/tiles/my_table5/style',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
              data: querystring.stringify({style: 'Map { background-color:#aaa; }'})
          },{}, function(res) {
            // FIXME: should be 401 Unauthorized
            assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
            assert.ok(res.body.indexOf('map state cannot be changed by unauthenticated request') != -1, res.body);

            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{
                status: 200,
            }, function(res) {
              var parsed = JSON.parse(res.body);
              assert.equal(parsed.style, 'Map { background-color:#fff; }');
              assert.equal(parsed.style_version, '2.0.0');
              done();
            });

          });
        });
    });

    test("post'ing good style returns 200 then getting returns original style", function(done){
        var style = 'Map { background-color:#fff; }';
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: style, style_version: '2.0.2'})
        },{}, function(res) { 

            assert.equal(res.statusCode, 200, res.body);

            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsed = JSON.parse(res.body);
              assert.equal(parsed.style, style);
              assert.equal(parsed.style_version, '2.0.2');

              assert.response(server, {
                  headers: {host: 'localhost'},
                  url: '/tiles/my_table5/style?style_convert=true',
                  method: 'GET'
              },{}, function(res) {
                assert.equal(res.statusCode, 200, res.body);
                var parsed = JSON.parse(res.body);
                assert.equal(parsed.style, style);
                assert.equal(parsed.style_version, mapnik_version);
                done();
              });
            });

        });
    
    });

    test("post'ing good style with style_convert returns 200 then getting returns converted style", function(done){
        var style = 'Map { background-color:#fff; }';
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: style, style_version: '2.0.2', style_convert: true})
        },{}, function(res) { 

            assert.equal(res.statusCode, 200, res.body);
            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsed = JSON.parse(res.body);
              // NOTE: no transform expected for the specific style
              assert.equal(parsed.style, style);
              assert.equal(parsed.style_version, mapnik_version);
              done();
            });
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // DELETE STYLE
    //
    /////////////////////////////////////////////////////////////////////////////////

    // Test that unauthenticated DELETE should fail
    // See https://github.com/Vizzuality/cartodb-management/issues/155
    test("delete'ing style with no authentication returns an error", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style',
            method: 'DELETE',
            headers: {host: 'localhost'},
        },{}, function(res) { 
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 500, res.body);
          assert.ok(res.body.indexOf('map state cannot be changed by unauthenticated request') != -1, res.body);
          // check that the style wasn't really deleted !
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/my_table5/style?map_key=1234',
              method: 'GET'
          },{
              status: 200,
          }, function(res) {
              var parsed = JSON.parse(res.body);
              assert.equal(parsed.style, 'Map { background-color:#fff; }');
              //assert.equal(parsed.version, '2.0.0');
              done();
          });
        });
    });

    test("delete'ing style returns 200 then getting returns default style", function(done){
        // this is the default style
        var style = _.template(default_style, {table: 'my_table5'});
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'DELETE',
            headers: {host: 'localhost'},
        },{}, function(res) { 
        assert.equal(res.statusCode, 200, res.body);

            // Retrive style with authenticated request
            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style?map_key=1234',
                method: 'GET'
            },{}, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            assert.deepEqual(JSON.parse(res.body).style, style);

              // Now retrive style with unauthenticated request
              assert.response(server, {
                  headers: {host: 'localhost'},
                  url: '/tiles/my_table5/style',
                  method: 'GET'
              }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              assert.deepEqual(JSON.parse(res.body).style, style);

                done();
              });
            });

        });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/38
    test("delete'ing style with api_key is accepted", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?api_key=1234',
            method: 'DELETE',
            headers: {host: 'localhost'},
        },{}, function(res) { 
          assert.equal(res.statusCode, 200, res.body);
          done();
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET INFOWINDOW
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    test("get'ing blank infowindow returns blank", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/my_tablez/infowindow',
            method: 'GET'
        },{
            status: 200,
            headers: { 'X-Cache-Channel': test_database+':my_tablez' },
            body: '{"infowindow":null}'
        }, function() { done(); });
    });
    
    test("get'ing blank infowindow with callback returns blank with callback", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/my_tablez/infowindow?callback=simon',
            method: 'GET'
        },{
            status: 200,
            body: 'simon({"infowindow":null});'
        }, function() { done(); });
    });
    
    
    test("get'ing completed infowindow with callback returns information with callback", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/my_table/infowindow?callback=simon',
            method: 'GET'
        },{
            status: 200,
            body: 'simon({"infowindow":"this, that, the other"});'
        }, function() { done(); });
    });

    test("get'ing infowindow of private table should fail when unauthenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/infowindow',
            method: 'GET'
        },{}, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 500, res.statusCode + ': ' + res.body);
          done();
        });
    });

    // See http://github.com/Vizzuality/Windshaft-cartodb/issues/55
    test("get'ing infowindow of private table should fail on unknown username",
    function(done) {
        assert.response(server, {
            headers: {host: 'unknown_user'},
            url: '/tiles/test_table_private_1/infowindow',
            method: 'GET'
        },{
        }, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 500, res.statusCode + ': ' + res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's database_name in redis (try CARTODB/script/restore_redis)"});
          done();
        });
    });

    test("get'ing infowindow of private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/infowindow?map_key=1234',
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          done();
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET GRID 
    //
    /////////////////////////////////////////////////////////////////////////////////

    test("get'ing a json with default style should return an grid", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.grid.json',
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'text/javascript; charset=utf-8; charset=utf-8',
                       'X-Cache-Channel': test_database+':gadm4' }
        }, function() { done(); });
    });
    
    test("get'ing a json with default style should return an grid", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.grid.json',
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'text/javascript; charset=utf-8; charset=utf-8' }
        }, function() { done(); });
    });
    
    test("get'ing a json with default style and sql should return a constrained grid", function(done){
        var sql = querystring.stringify({sql: "SELECT * FROM gadm4 WHERE codineprov = '08'"})
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.grid.json?' + sql,
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'text/javascript; charset=utf-8; charset=utf-8' }
        }, function() { done(); });
    });

    test("get'ing the grid of a private table should fail when unauthenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/6/31/24.grid.json',
            method: 'GET'
        },{}, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          done();
        });
    });

    // See http://github.com/Vizzuality/Windshaft-cartodb/issues/55
    test("get'ing grid of private table should fail on unknown username",
    function(done) {
        assert.response(server, {
            headers: {host: 'unknown_user'},
            url: '/tiles/test_table_private_1/6/31/24.grid.json',
            method: 'GET'
        },{
        }, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's database_name in redis (try CARTODB/script/restore_redis)"});
          done();
        });
    });

    test("get'ing the grid of a private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/6/31/24.grid.json?map_key=1234',
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          done();
        });
    });
    
    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET TILE
    //
    /////////////////////////////////////////////////////////////////////////////////

    test("should send Cache-Control header with short expiration by default", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png',
            method: 'GET'
        },{
            status: 200,
        }, function(res) {
          var cc = res.headers['cache-control'];
          assert.ok(cc);
          //assert.equal(cc, 'public,max-age=31536000');  // 1 year
          assert.ok(cc.match('no-cache'), cc);
          assert.ok(cc.match('must-revalidate'), cc);
          assert.ok(cc.match('public'), cc);
          done();
        });
    });

    test("should send Cache-Control header with long expiration when requested", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?cache_policy=persist',
            method: 'GET'
        },{
            status: 200,
        }, function(res) {
          var cc = res.headers['cache-control'];
          assert.ok(cc);
          assert.equal(cc, 'public,max-age=31536000');  // 1 year
          done();
        });
    });

    test("get'ing a tile with default style should return an image", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?geom_type=polygon',
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png', 'X-Cache-Channel': test_database+':gadm4' }
        }, function() { done(); });
    });
    
    test("get'ing a tile with default style and sql should return a constrained image", function(done){
        var sql = querystring.stringify({sql: "SELECT * FROM gadm4 WHERE codineprov = '08'"});
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        }, function() { done(); });
    });
    
    
    test("get'ing a tile with default style and complex sql should return a constrained image", function(done){
        var sql = querystring.stringify({sql: "SELECT * FROM gadm4 WHERE  codineprov = '08' AND codccaa > 60"})
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        }, function() { done(); });
    });

    test("get'ing a tile with data from private table should succeed when authenticated", function(done){
        // NOTE: may fail if grainstore < 0.3.0 is used by Windshaft
        var sql = querystring.stringify({sql: "SELECT * FROM test_table_private_1", map_key: 1234})
        assert.response(server, {
            headers: {host: 'localhost'},
            // NOTE: we encode a public table in the URL !
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        }, function() { done(); });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/38
    test("get'ing a tile with data from private table should succeed when authenticated with api_key", function(done){
        // NOTE: may fail if grainstore < 0.3.0 is used by Windshaft
        var sql = querystring.stringify({sql: "SELECT * FROM test_table_private_1", api_key: 1234})
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        }, function() { done(); });
    });

    test("get'ing a tile with data from private table should fail when unauthenticated", function(done){
        var sql = querystring.stringify({
          sql: "SELECT * FROM test_table_private_1",
          cache_buster:2 // this is to avoid getting the cached response
        });
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
        }, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          done();
        });
    });

    test("get'ing a tile with data from private table should fail on unknown username", function(done){
        var sql = querystring.stringify({
          sql: "SELECT * FROM test_table_private_1",
          cache_buster:2 // this is to avoid getting the cached response
        });
        assert.response(server, {
            headers: {host: 'unknown_user'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
        }, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's database_name in redis (try CARTODB/script/restore_redis)"});
          assert.ok(!res.headers.hasOwnProperty('cache-control'),
            "Unexpected Cache-Control: " + res.headers['cache-control']);
          done();
        });
    });

    test("get'ing a tile with data from private table should fail when unauthenticated (uses old redis key)", function(done){
        var sql = querystring.stringify({
          sql: "SELECT * FROM test_table_private_1",
          cache_buster:3,
          // 1235 is written in rails:users:localhost:map_key SET
          // See https://github.com/Vizzuality/Windshaft-cartodb/issues/39
          map_key: 1235
        });
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
        }, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          // Failed in 1.6.0 of https://github.com/CartoDB/Windshaft-cartodb/issues/107
          assert.ok(!res.headers.hasOwnProperty('cache-control'),
            "Unexpected Cache-Control: " + res.headers['cache-control']);
          done();
        });
    });

    test("get'ing a tile with url specified 2.0.0 style should return an expected tile",  function(done){
        var style = querystring.stringify({style: test_style_black_200, style_version: '2.0.0'});
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table/15/16046/12354.png?cache_buster=4&' + style, // madrid
            method: 'GET',
            encoding: 'binary'
        },{}, function(res){
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          var ct = res.headers['content-type'];
          assert.equal(ct, 'image/png');
          assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',  2,
            function(err, similarity) {
              if (err) throw err;
              done();
          });
        });
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/88
    test("get'ing a tile from a user-specific database should return an expected tile",  function(done){
        var style = querystring.stringify({style: test_style_black_200, style_version: '2.0.0'});
        var backupDBHost = global.environment.postgres.host;
        global.environment.postgres.host = '6.6.6.6';
        Step (
          function() {
            var next = this;
            assert.response(server, {
                headers: {host: 'cartodb250user'},
                url: '/tiles/test_table/15/16046/12354.png?cache_buster=4.10&' + style, 
                method: 'GET',
                encoding: 'binary'
            },{}, function(res){
              next(null, res);
            });
          },
          function checkRes(err, res) {
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body,
              './test/fixtures/test_table_15_16046_12354_styled_black.png',
              2, this);
          },
          function checkImage(err, similarity) {
              if (err) throw err;
              return null
          },
          function finish(err) {
            global.environment.postgres.host = backupDBHost;
            done(err);
          }
        );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/89
    test("get'ing a tile with a user-specific database password",  function(done){
        var style = querystring.stringify({style: test_style_black_200, style_version: '2.0.0'});
        var backupDBPass = global.settings.postgres_auth_pass;
        global.settings.postgres_auth_pass = '<%= user_password %>';
        Step (
          function() {
            var next = this;
            assert.response(server, {
                headers: {host: 'cartodb250user'},
                url: '/tiles/test_table/15/16046/12354.png?'
                  + 'cache_buster=4.20&api_key=4321&' + style, 
                method: 'GET',
                encoding: 'binary'
            },{}, function(res){
              next(null, res);
            });
          },
          function checkRes(err, res) {
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body,
              './test/fixtures/test_table_15_16046_12354_styled_black.png',
              2, this);
          },
          function checkImage(err, similarity) {
              if (err) throw err;
              return null
          },
          function finish(err) {
            global.settings.postgres_auth_pass = backupDBPass;
            done(err);
          }
        );
    });

    test("get'ing a tile with url specified 2.1.0 style should return an expected tile",  function(done){
        var style = querystring.stringify({style: test_style_black_210, style_version: '2.1.0'});
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table/15/16046/12354.png?cache_buster=4&' + style, // madrid
            method: 'GET',
            encoding: 'binary'
        },{}, function(res){
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          var ct = res.headers['content-type'];
          assert.equal(ct, 'image/png');
          assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',  2,
            function(err, similarity) {
              if (err) throw err;
              done();
          });
        });
    });

    test("get'ing a tile with url specified 2.1.0 style (lzma version)",  function(done){
        var qo = {
          style: test_style_black_210,
          style_version: '2.1.0',
          cache_buster: 5
        };
        Step (
          function compressQuery () {
            //console.log("Compressing starts");
            var next = this;
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
            assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',  2,
              function(err, similarity) {
                next(err);
            });
          },
          function finish(err) {
            done(err);
          }
        );
    });

    // See http://github.com/Vizzuality/Windshaft-cartodb/issues/57
    test("GET'ing a tile as anonymous with style set by POST",  function(done){
      var style = querystring.stringify({style: test_style_black_210, style_version: '2.1.0'});
      Step (
        function postStyle1() {
          var next = this;
          assert.response(server, {
              method: 'POST',
              url: '/tiles/test_table/style',
              headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
              data: querystring.stringify({style: 'Map { background-color:#fff; }', map_key: 1234})
          },{}, function(res) {
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            next();
          });
        },
        // Load the new cache with results from Style1 above
        function getTileAnon1(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/test_table/15/16046/12354.png', 
              method: 'GET',
              encoding: 'binary'
          },{}, function(res){
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body, './test/fixtures/blank.png',  0,
              function(err, similarity) {
                if (err) next(err); 
                else next();
            });
          });
        },
        // Get again with authentication 
        function getTileAuth1(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/test_table/15/16046/12354.png?map_key=1234', 
              method: 'GET',
              encoding: 'binary'
          },{}, function(res){
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body, './test/fixtures/blank.png',  0,
              function(err, similarity) {
                if (err) next(err); 
                else next();
            });
          });
        },
        // Change the style
        function postStyle2(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              method: 'POST',
              url: '/tiles/test_table/style',
              headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
              data: querystring.stringify({style: test_style_black_200, map_key: 1234})
          },{}, function(res) {
            try {
              assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
              next();
            }
            catch (err) { next(err); }
          });
        },
        // Verify the Style2 is applied. NOTE: pass the SAME cache_buster as before!
        function getTileAnon2(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/test_table/15/16046/12354.png', 
              method: 'GET',
              encoding: 'binary'
          },{}, function(res){
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',  2,
              function(err, similarity) {
                // NOTE: we expect them to be EQUAL here
                if (err) { next(err); return; }
                next();
            });
          });
        },
        // Delete the style
        function delStyle(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              method: 'DELETE',
              url: '/tiles/test_table/style?map_key=1234',
              headers: {host: 'localhost'}
          },{}, function(res) {
            try {
              assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
              next();
            }
            catch (err) { next(err); }
          });
        },
        // Verify the default style is applied. 
        function getTileAnon3(err) {
          if ( err ) throw err;
          var next = this;
          assert.response(server, {
              headers: {host: 'localhost'},
              url: '/tiles/test_table/15/16046/12354.png?cache_buster=2314',
              method: 'GET',
              encoding: 'binary'
          },{}, function(res){
            assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
            var ct = res.headers['content-type'];
            assert.equal(ct, 'image/png');
            assert.imageEqualsFile(res.body, './test/fixtures/test_table_15_16046_12354_styled_black.png',  2,
              function(err, similarity) {
                // NOTE: we expect them to be different here
                if (err) next(); 
                else next(new Error('Last posted style still in effect after delete'));
            });
          });
        },
        function finish(err) {
          done(err);
        }
      );
    });

    test("uses sqlapi to figure source data of query", function(done){
        var qo = {
          sql: "SELECT g.cartodb_id, g.codineprov, t.the_geom_webmercator "
              + "FROM gadm4 g, test_table t "
              + "WHERE g.cartodb_id = t.cartodb_id",
          map_key: 1234
        };
        var sqlapi;
        Step(
          function sendRequest(err) {
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
            var jsonquery = cc.substring(dbname.length+1);
            var sentquery = JSON.parse(jsonquery);
            assert.equal(sentquery.api_key, qo.map_key);
            assert.equal(sentquery.q, 'SELECT CDB_QueryTables($windshaft$' + qo.sql + '$windshaft$)');
            return null;
          },
          function finish(err) {
            done(err);
          }
        );
    });

    test("passes hostname header to sqlapi", function(done){
        var qo = {
          sql: "SELECT * from gadm4",
          map_key: 1234
        };
        var sqlapi;
        Step(
          function sendRequest(err) {
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
            var last_request = sqlapi_server.getLastRequest();
            assert.ok(last_request);
            var host = last_request.headers['host'];
            assert.ok(host);
            assert.equal(last_request.method, 'GET');
            assert.equal(host, 'localhost.donot_look_this_up');
            return null;
          },
          function finish(err) {
            done(err);
          }
        );
    });

    test("requests to skip cache on sqlapi error", function(done){
        var qo = {
          sql: "SELECT g.cartodb_id, g.codineprov, t.the_geom_webmercator "
              + ", 'SQLAPIERROR' is not null "
              + "FROM gadm4 g, test_table t "
              + "WHERE g.cartodb_id = t.cartodb_id",
          map_key: 1234
        };
        var sqlapi;
        Step(
          function sendRequest(err) {
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

    // Zoom is a special variable
    test("Specifying zoom level in CartoCSS does not need a 'zoom' variable in SQL output", function(done){
        // NOTE: may fail if grainstore < 0.3.0 is used by Windshaft
        var query = querystring.stringify({
          sql: "SELECT 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator, 1::int as cartodb_id",
          style: '#gadm4 [ zoom>=3] { marker-fill:red; }'
        });
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/0/0/0.png?' + query,
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          done();
        });
    });

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
    // DELETE CACHE 
    //
    /////////////////////////////////////////////////////////////////////////////////

    test("forbids flushing cache without specifying table name", function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/flush_cache',
            method: 'DELETE'
        },{}, function(res) {
          assert.equal(res.statusCode, 404, res.statusCode + ': ' + res.body);
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });

    test("allows flushing table cache by unauthenticated user", function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/flush_cache',
            method: 'DELETE'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // TODO: also check that varnish is signalled (using VarnishEmu)
          // NOTE: requires enable_cache=1 in test.js
          done();
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET METADATA
    //
    /////////////////////////////////////////////////////////////////////////////////

    test("does not provide metadata of private table to unauthenticated requests", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/map_metadata',
            method: 'GET'
        },{}, function(res) {
          // FIXME: should be 401 instead
          assert.equal(res.statusCode, 500, res.statusCode + ': ' + res.body);
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });

    test("does provide metadata of private table to authenticated requests", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/test_table_private_1/map_metadata?map_key=1234',
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          done();
        });
    });

    test("does provide metadata of public table to unauthenticated requests", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/map_metadata',
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // TODO: show metadata ?
          done();
        });
    });

    test("does provide metadata of public table to authenticated requests", function(done){
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/map_metadata?map_key=1234',
            method: 'GET'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // TODO: show metadata ?
          done();
        });
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // DELETE CACHE 
    //
    /////////////////////////////////////////////////////////////////////////////////

    test("forbids flushing cache without specifying table name", function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/flush_cache',
            method: 'DELETE'
        },{}, function(res) {
          assert.equal(res.statusCode, 404, res.statusCode + ': ' + res.body);
          assert.ok(!res.headers.hasOwnProperty('cache-control'));
          done();
        });
    });

    test("allows flushing table cache by unauthenticated user", function(done) {
        assert.response(server, {
            headers: {host: 'localhost'},
            url: '/tiles/gadm4/flush_cache',
            method: 'DELETE'
        },{}, function(res) {
          assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
          // TODO: also check that varnish is signalled (using VarnishEmu)
          // NOTE: requires enable_cache=1 in test.js
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
            _.each(matches, function(k) { redis_client.del(k); });
            sqlapi_server.close(done);
        });
    });
    
});

