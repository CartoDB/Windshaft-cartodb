var assert      = require('../support/assert');
var tests       = module.exports = {};
var _           = require('underscore');
var querystring = require('querystring');
require(__dirname + '/../test_helper');

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

suite('server', function() {
    
    test("get call to server returns 200", function(done){
        assert.response(server, {
            url: '/',
            method: 'GET'
        },{
            status: 200
        }, function() { done(); });
    });
    
    test("get'ing blank style returns default style", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/my_table/style',
            method: 'GET'
        },{
            status: 200,
            body: '{"style":"#my_table {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}"}'
        }, function() { done(); });
    });
    
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
            url: '/tiles/my_table3/style',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table3{backgxxxxxround-color:#fff;}'})
        },{
            status: 500,
            body: JSON.stringify(['style.mss:1:11 Unrecognized rule: backgxxxxxround-color'])
        }, function() { done(); });
    });
    
    test("post'ing multiple bad styles returns 400 with error array", function(done){
        assert.response(server, {
            url: '/tiles/my_table4/style',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: '#my_table4{backgxxxxxround-color:#fff;foo:bar}'})
        },{
            status: 500,
            body: JSON.stringify([ 'style.mss:1:11 Unrecognized rule: backgxxxxxround-color', 'style.mss:1:38 Unrecognized rule: foo' ])
        }, function() { done(); });
    });
    
    test("post'ing good style returns 200", function(done){
        assert.response(server, {
            url: '/tiles/my_table5/style',
            method: 'POST',
            headers: {host: 'vizzuality.localhost.lan', 'Content-Type': 'application/x-www-form-urlencoded' },
            data: querystring.stringify({style: 'Map {background-color:#fff;}'})
        },{
        }, function(res) {
            assert.equal(res.statusCode, 200, res.body);
            done();
        });
    });

    test("post'ing good style returns 200 then getting returns original style", function(done){
        var style = 'Map {background-color:#fff;}';
        assert.response(server, {
            url: '/tiles/my_table5/style',
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
    
    test("get'ing blank infowindow returns blank", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/my_tablez/infowindow',
            method: 'GET'
        },{
            status: 200,
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
    
    test("get'ing a tile with default style should return an image", function(done){
        assert.response(server, {
            headers: {host: 'vizzuality.localhost.lan'},
            url: '/tiles/gadm4/6/31/24.png?geom_type=polygon',
            method: 'GET'
        },{
            status: 200,
            headers: { 'Content-Type': 'image/png' }
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
    
});

