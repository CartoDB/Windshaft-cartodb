
var   assert      = require('assert')
    , tests       = module.exports = {}
    , _           = require('underscore')
    , querystring = require('querystring')
    , fs          = require('fs')
    , th          = require(__dirname + '/../test_helper')
    , CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft')
    , http          = require('http')
    , Step          = require('step')
    , CacheValidator = require(__dirname + '/../../lib/cartodb/cache_validator')

var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');

var cached_server = new CartodbWindshaft(serverOptions);

tests["first time a tile is request should not be cached"] = function() {
    assert.response(cached_server, {
        url: '/tiles/gadm4/6/31/24.png?geom_type=polygon',
        headers: {host: 'vizzuality.localhost.lan'},
        method: 'GET'
    },{
        status: 200

    }, function(res) {
        assert.ok(res.header('X-Cache-hit') === undefined);

    });

}

/*
tests["second time a tile is request should be cached"] = function() {

   var cached_server2 = new CartodbWindshaft(serverOptions);
   var url= '/tiles/gadm4/6/31/24.png';
   assert.response(cached_server2, {
            url: url,
        	headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
    },{
        status: 200
    }, function(res) {
        assert.response(cached_server2, {
            url: url,
        	headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
        },{
            status: 200
        }, function(res) {
            assert.ok(res.header('X-Cache-hit') !== undefined);
        });
    });
}
*/


tests["LRU tile should be removed"] = function() {

    var urls = ['/tiles/gadm4/6/31/24.png',
               '/tiles/gadm4/6/31/25.png',
               '/tiles/gadm4/6/31/26.png',
               '/tiles/gadm4/6/31/27.png'];
    
    //create another server to not take previos test stats into account
	var so = _.clone(serverOptions);
	_(so).extend({lru_cache: true, lru_cache_size: 3});

    var _cached_server = new CartodbWindshaft(so);
    
    function makeReq(url, callback) {
        assert.response(_cached_server, {
                url: url,
        		headers: {host: 'vizzuality.localhost.lan'},
                method: 'GET'
        },{
            status: 200
        }, callback);
    }

    Step(
        function() {
            makeReq(urls[0], this);
        },
        function() {
            makeReq(urls[1], this);
        },
        function() {
            makeReq(urls[2], this);
        },
         function() {
            makeReq(urls[3], this);
        }, function() {
            assert.response(_cached_server, {
            url: urls[0],
        	headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
            },{
                status: 200

            }, function(res) {
                assert.ok(res.header('X-Cache-hit') === undefined);
                var st = so.cacheStats()
                assert.eql(st.cache_hits, 0);
                assert.eql(st.cache_misses, 5);
                assert.eql(st.current_items, 3);
            });
        }
    )

}

tests["cache should be invalidated"] = function() {

   var url = '/tiles/gadm4/6/29/27.png';
   var cache = CacheValidator(global.environment.redis);
   assert.response(cached_server, {
            url: url,
        	headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
    },{
        status: 200
    }, function(res) {
        cache.setTimestamp('cartodb_dev_user_3_db', 'gadm4', (new Date().getTime()/1000.0)+100, function() {
            assert.response(cached_server, {
                url: url,
        		headers: {host: 'vizzuality.localhost.lan'},
                method: 'GET'
            },{
                status: 200
            }, function(res) {
                assert.ok(res.header('X-Cache-hit') === undefined);
            });
        });
    });

}

