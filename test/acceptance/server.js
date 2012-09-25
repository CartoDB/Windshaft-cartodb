var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var querystring = require('querystring');
require(__dirname + '/../support/test_helper');

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('server', function() {

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
    // GET STYLE
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    test("get'ing blank style returns default style", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/my_table/style',
            method: 'GET'
        },{
            status: 200,
            headers: { 'X-Cache-Channel': 'cartodb_test_user_1_db:my_table' },
            body: '{"style":"#my_table {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}"}'
        }, function() { done(); });
    });

    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/43
    test("get'ing style of private table should fail when unauthenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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

    test("get'ing style of private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/test_table_private_1/style?map_key=1234',
            method: 'GET'
        },{
        }, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          assert.deepEqual(res.body, '{"style":"#test_table_private_1 {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}"}');
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{backgxxxxxround-color:#fff;}'})
        },{
            status: 500, // FIXME: should be 400 !
            body: JSON.stringify(['style.mss:1:11 Unrecognized rule: backgxxxxxround-color'])
        }, function() { done(); });
    });
    
    test("post'ing multiple bad styles returns 400 with error array", function(done){
        assert.response(server, {
            url: '/tiles/my_table4/style?map_key=1234',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table4{backgxxxxxround-color:#fff;foo:bar}'})
        },{
            status: 500, // FIXME: should be 400 !
            body: JSON.stringify([ 'style.mss:1:11 Unrecognized rule: backgxxxxxround-color', 'style.mss:1:38 Unrecognized rule: foo' ])
        }, function() { done(); });
    });

    test("post'ing good style returns 200", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
        },{
        }, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            done();
        });
    });
    
    test("post'ing good style with no authentication returns an error", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
        },{
        }, function(res) {
          assert.equal(res.statusCode, 200, res.body);
          assert.response(server, {
              url: '/tiles/my_table5/style',
              method: 'POST',
              headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
              data: querystring.stringify({style: 'Map {background-color:#aaa;}'})
          },{}, function(res) {
            // FIXME: should be 401 Unauthorized
            assert.equal(res.statusCode, 500, res.body);
            assert.ok(res.body.indexOf('map state cannot be changed by unauthenticated request') != -1, res.body);

            assert.response(server, {
                headers: {host: 'vizzuality.localhost.lan'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{
                status: 200,
                body: JSON.stringify({style: 'Map {background-color:#fff;}'})
            }, function() { done(); });

          });
        });
    });

    test("post'ing good style returns 200 then getting returns original style", function(done){
        var style = 'Map {background-color:#fff;}';
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: style})
        },{
        }, function(res) { 

            assert.equal(res.statusCode, 200, res.body);

            assert.response(server, {
                headers: {host: 'vizzuality.localhost.lan'},
                url: '/tiles/my_table5/style',
                method: 'GET'
            },{
                status: 200,
                body: JSON.stringify({style: style})
            }, function() { done(); });

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
            headers: {host: 'vizzuality'},
        },{}, function(res) { 
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 500, res.body);
          assert.ok(res.body.indexOf('map state cannot be changed by unauthenticated request') != -1, res.body);
          // check that the style wasn't really deleted !
          assert.response(server, {
              headers: {host: 'vizzuality'},
              url: '/tiles/my_table5/style?map_key=1234',
              method: 'GET'
          },{
              status: 200,
              body: JSON.stringify({style: 'Map {background-color:#fff;}'})
          }, function() { done(); });
        });
    });

    test("delete'ing style returns 200 then getting returns default style", function(done){
        // this is the default style
        var style = '#my_table5 {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}'
        assert.response(server, {
            url: '/tiles/my_table5/style?map_key=1234',
            method: 'DELETE',
            headers: {host: 'vizzuality'},
        },{}, function(res) { 
        assert.equal(res.statusCode, 200, res.body);

            // Retrive style with authenticated request
            assert.response(server, {
                headers: {host: 'vizzuality'},
                url: '/tiles/my_table5/style?map_key=1234',
                method: 'GET'
            },{}, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            assert.deepEqual(JSON.parse(res.body).style, style);

              // Now retrive style with unauthenticated request
              assert.response(server, {
                  headers: {host: 'vizzuality'},
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

    /////////////////////////////////////////////////////////////////////////////////
    //
    // GET INFOWINDOW
    //
    /////////////////////////////////////////////////////////////////////////////////
    
    test("get'ing blank infowindow returns blank", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/my_tablez/infowindow?callback=simon',
            method: 'GET'
        },{
            status: 200,
            body: 'simon({"infowindow":null});'
        }, function() { done(); });
    });
    
    
    test("get'ing completed infowindow with callback returns information with callback", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/test_table_private_1/infowindow',
            method: 'GET'
        },{}, function(res) {
          // FIXME: should be 401 Unauthorized
          assert.equal(res.statusCode, 500, res.body);
          done();
        });
    });

    test("get'ing infowindow of private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/test_table_private_1/6/31/24.grid.json',
            method: 'GET'
        },{}, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          done();
        });
    });

    test("get'ing the grid of a private table should succeed when authenticated",
    function(done) {
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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
    
    test("get'ing a tile with default style should return an image", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
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
            headers: {host: 'vizzuality.localhost.lan'},
            // NOTE: we encode a public table in the URL !
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
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
        }, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          done();
        });
    });

    test("get'ing a tile with data from private table should fail when unauthenticated (uses old redis key)", function(done){
        var sql = querystring.stringify({
          sql: "SELECT * FROM test_table_private_1",
          cache_buster:3,
          // 1235 is written in rails:users:vizzuality:map_key SET
          // See https://github.com/Vizzuality/Windshaft-cartodb/issues/39
          map_key: 1235
        });
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/gadm4/6/31/24.png?' + sql,
            method: 'GET'
        },{
        }, function(res) {
          // 401 Unauthorized
          assert.equal(res.statusCode, 401, res.statusCode + ': ' + res.body);
          done();
        });
    });

});

