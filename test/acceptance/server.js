var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var redis       = require('redis');
var querystring = require('querystring');
require(__dirname + '/../support/test_helper');

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('server', function() {

    var redis_client = redis.createClient(global.environment.redis.port);
    
    suiteSetup(function(){
    });

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET UNSUPPORTED
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    // TODO: I guess this should be a 404 instead...
    test("get call to server returns 200", function(done){
        assert.response(server, {
            url: '/',
            method: 'GET'
        },{
            status: 200
        }, function() { done(); });
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
            headers: { 'X-Cache-Channel': 'cartodb_test_user_1_db:my_table' },
        }, function(res) {
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.style, "#my_table {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}");
            assert.equal(parsed.style_version, '2.0.0');
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
          assert.equal(res.statusCode, 500, res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error: 'Sorry, you are unauthorized (permission denied)'});
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
          assert.equal(res.statusCode, 500, res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's dbname in redis (try CARTODB/script/restore_redis)"});
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
          assert.equal(parsed.style, "#test_table_private_1 {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}");
          assert.equal(parsed.style_version, '2.0.0');
          done();
        });
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
            status: 400,
            body: '{"error":"must send style information"}'
        }, function() { done(); });
    });
    
    test("post'ing bad style returns 400 with error", function(done){
        assert.response(server, {
            url: '/tiles/my_table3/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{backgxxxxxround-color:#fff;}'})
        },{
            status: 500, // FIXME: should be 400 !
            body: /Unrecognized rule: backgxxxxxround-color/
        }, function() { done(); });
    });

    test("post'ing unparseable style returns 400 with error", function(done){
        assert.response(server, {
            url: '/tiles/my_table3/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{'})
        },{
            status: 500, // FIXME: should be 400 !
            body: /Missing closing/
        }, function() { done(); });
    });
    
    test("post'ing multiple bad styles returns 400 with error array", function(done){
        assert.response(server, {
            url: '/tiles/my_table4/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table4{backgxxxxxround-color:#fff;foo:bar}'})
        },{
            status: 500, // FIXME: should be 400 !
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
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
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
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
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
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
        },{
        }, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          assert.response(server, {
              url: '/tiles/my_table5/style',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
              data: querystring.stringify({style: 'Map {background-color:#aaa;}'})
          },{}, function(res) {
            // FIXME: should be 401 Unauthorized
            assert.equal(res.statusCode, 500, res.body);
            assert.ok(res.body.indexOf('map state cannot be changed by unauthenticated request') != -1, res.body);

            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{
                status: 200,
            }, function(res) {
              var parsed = JSON.parse(res.body);
              assert.equal(parsed.style, 'Map {background-color:#fff;}');
              assert.equal(parsed.style_version, '2.0.0');
              done();
            });

          });
        });
    });

    test("post'ing good style returns 200 then getting returns original style", function(done){
        var style = 'Map {background-color:#fff;}';
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: style, style_version: '2.0.2'})
        },{
        }, function(res) { 

            assert.equal(res.statusCode, 200, res.body);

            assert.response(server, {
                headers: {host: 'localhost'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{
                status: 200,
            }, function(res) {
              var parsed = JSON.parse(res.body);
              assert.equal(parsed.style, style);
              assert.equal(parsed.style_version, '2.0.2');
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
              assert.equal(parsed.style, 'Map {background-color:#fff;}');
              //assert.equal(parsed.version, '2.0.0');
              done();
          });
        });
    });

    test("delete'ing style returns 200 then getting returns default style", function(done){
        // this is the default style
        var style = '#my_table5 {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}'
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
            headers: { 'X-Cache-Channel': 'cartodb_test_user_1_db:my_tablez' },
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
          assert.equal(res.statusCode, 500, res.body);
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
          assert.equal(res.statusCode, 500, res.body);
          assert.deepEqual(JSON.parse(res.body),
            {error:"missing unknown_user's dbname in redis (try CARTODB/script/restore_redis)"});
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
                       'X-Cache-Channel': 'cartodb_test_user_1_db:gadm4' }
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
            {error:"missing unknown_user's dbname in redis (try CARTODB/script/restore_redis)"});
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
            headers: { 'Content-Type': 'image/png', 'X-Cache-Channel': 'cartodb_test_user_1_db:gadm4' }
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
            {error:"missing unknown_user's dbname in redis (try CARTODB/script/restore_redis)"});
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
          done();
        });
    });

    var test_style_black_200 = "#test_table{marker-fill:black;marker-line-color:red;marker-width:10}";
    var test_style_black_210 = "#test_table{marker-fill:black;marker-line-color:red;marker-width:20}";

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
            done();
        });
    });
    
});

