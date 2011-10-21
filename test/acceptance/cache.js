
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
        url: '/tiles/test_table_3/6/31/24.png?geom_type=polygon',
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
   var url= '/tiles/test_table_2/6/31/24.png';
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

    var urls = ['/tiles/test_table_2/6/31/24.png',
               '/tiles/test_table_2/6/31/25.png',
               '/tiles/test_table_2/6/31/26.png',
               '/tiles/test_table_2/6/31/27.png'];
    
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

   var url = '/tiles/test_table_2/6/29/27.png';
   var cached_server2 = new CartodbWindshaft(serverOptions);
   var cache = CacheValidator(global.environment.redis);
   assert.response(cached_server2, {
            url: url,
            headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
    },{
        status: 200
    }, function(res) {
        cache.setTimestamp('cartodb_test_user_1_db', 'test_table_2', (new Date().getTime()/1000.0)+100, function() {
            assert.response(cached_server2, {
                url: url,
                headers: {host: 'vizzuality.localhost.lan'},
                method: 'GET'
            },{
                status: 200
            }, function(r) {
                assert.ok(r.header('X-Cache-hit') === undefined);
            });
        });
    });

};

tests["Last-Modified header should be sent"] = function() {
   var cached_server2 = new CartodbWindshaft(serverOptions);
   var url= '/tiles/test_table/6/31/22.png';
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
            var last_modified = res.header('Last-Modified');
            assert.ok(last_modified !== undefined);
            assert.response(cached_server2, {
                    url: url,
                    headers: {
                        host: 'vizzuality.localhost.lan',
                        'if-modified-since': last_modified
                    },
                    method: 'GET'
           }, {
                status: 304
           });
        });
    });
}

tests["TTL should invalidate a tile"] = function() {

    var url = '/tiles/test_table_2/6/31/24.png';
    
    //create another server to not take previos test stats into account
    var so = _.clone(serverOptions);
    _(so).extend({ttl_timeout: 1});

    var _cached_server = new CartodbWindshaft(so);
    // cache it
    assert.response(_cached_server, {
            url: url,
            headers: {host: 'vizzuality.localhost.lan'},
            method: 'GET'
    },{
        status: 200
    }, function(res) {
        console.log("WAIT A LITTLE BIT PLEASE");

        // test before invalidating
        setTimeout(function() {
            var st = so.cacheStats();
            assert.eql(st.expired, 0);
        }, 500);

        // test after invalidation
        setTimeout(function() {
            assert.response(_cached_server, {
                    url: url,
                    headers: {host: 'vizzuality.localhost.lan'},
                    method: 'GET'
            },{
                status: 200
            }, function(res) {
                assert.ok(res.header('X-Cache-hit') === undefined);
                var st = so.cacheStats();
                assert.eql(st.expired, 1);
            });
        }, 2000);
    });
}
