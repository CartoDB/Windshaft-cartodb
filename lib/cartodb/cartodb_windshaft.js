
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
        if ( ! req.params.hasOwnProperty('dbuser') ) {
          err = new Error("map state cannot be changed by unauthenticated request!");
        }
        callback(err, req);
    }

    // boot
    var ws = new Windshaft.Server(serverOptions);

    // Override getVersion to include cartodb-specific versions
    var wsversion = ws.getVersion;
    ws.getVersion = function() {
      var version = wsversion();
      version.windshaft_cartodb = require('../../package.json').version;
      return version;
    }

    // Override sendError to drop added cache headers (if any)
    // See http://github.com/CartoDB/Windshaft-cartodb/issues/107
    var ws_sendError = ws.sendError;
    ws.sendError = function(res) {
      if ( res._headers ) {
        delete res._headers['cache-control'];
        delete res._headers['last-modified'];
        delete res._headers['x-cache-channel'];
      } else {
        console.log("WARNING: response has no _headers: "); console.dir(res);
      }
      ws_sendError.apply(this, arguments);
    };

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
                    ws.sendError(res, {error: err.message}, 500, 'GET INFOWINDOW');
                    //res.send({error: err.message}, 500);
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
                    ws.sendError(res, {error: err.message}, 500, 'GET MAP_METADATA');
                    //res.send(err.message, 500);
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
            function flushCache(){
                serverOptions.flushCache(req, serverOptions.cache_enabled ? Cache : null, this);
            },
            function sendResponse(err, data){
                if (err){
                    ws.sendError(res, {error: err.message}, 500, 'DELETE CACHE');
                    //res.send(500);
                } else {
                    res.send({status: 'ok'}, 200);
                }
            }
        );
    });
    return ws;
}

module.exports = CartodbWindshaft;
