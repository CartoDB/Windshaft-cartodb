
var _ = require('underscore')
    , Step       = require('step')
    , Windshaft = require('windshaft')
    , Cache = require('./cache_validator');

var CartodbWindshaft = function(serverOptions) {

    if(serverOptions.cache_enabled) {
        console.log("cache invalidation enabled, varnish on ", serverOptions.varnish_host, ' ', serverOptions.varnish_port);
        Cache.init(serverOptions.varnish_host, serverOptions.varnish_port);
        serverOptions.afterStateChange = function(req, data, callback) {
            Cache.invalidate_db(req.params.dbname, req.params.table);
            callback(null, data);
        }
    }

    serverOptions.beforeStateChange = function(req, callback) {
        var err = null;
        if ( ! req.hasOwnProperty('dbuser') ) {
          err = new Error("map state cannot be changed by unauthenticated request!");
        }
        callback(err, req);
    }

    // boot
    var ws = new Windshaft.Server(serverOptions);

    /**
     * Helper to allow access to the layer to be used in the maps infowindow popup.
     */
    ws.get(serverOptions.base_url + '/infowindow', function(req, res){
        ws.doCORS(res);
        Step(
            function(){
                serverOptions.getInfowindow(req, this);
            },
            function(err, data){
                if (err){
                    res.send({error: err.message}, 500);
                } else {
                    res.send({infowindow: data}, 200);
                }
            }
        );
    });


    /**
     * Helper to allow access to metadata to be used in embedded maps.
     */
    ws.get(serverOptions.base_url + '/map_metadata', function(req, res){
        ws.doCORS(res);
        Step(
            function(){
                serverOptions.getMapMetadata(req, this);
            },
            function(err, data){
                if (err){
                    res.send(err.message, 500);
                } else {
                    res.send({map_metadata: data}, 200);
                }
            }
        );
    });

    /**
     * Helper API to allow per table tile cache (and sql cache) to be invalidated remotely.
     * TODO: Move?
     */
    ws.del(serverOptions.base_url + '/flush_cache', function(req, res){
        ws.doCORS(res);
        Step(
            function(){
                serverOptions.flushCache(req, Cache, this);
            },
            function(err, data){
                if (err){
                    res.send(500);
                } else {
                    res.send({status: 'ok'}, 200);
                }
            }
        );
    });
    return ws;
}

module.exports = CartodbWindshaft;
