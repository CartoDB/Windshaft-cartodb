
var _ = require('underscore')
    , Step       = require('step')
    , Windshaft = require('windshaft')
    , Cache = require('./cache_validator');

var CartodbWindshaft = function(serverOptions) {

    // set the cache chanel info to invalidate the cache on the frontend server
    serverOptions.afterTileRender = function(req, res, tile, headers, callback) {
        Cache.generateCacheChannel(req, function(channel){
            res.header('X-Cache-Channel', channel);
            res.header('Last-Modified', new Date().toUTCString());
            res.header('Cache-Control', 'no-cache,max-age=86400,must-revalidate, public');
            callback(null, tile, headers);
        });
    };

    if(serverOptions.cache_enabled) {
        console.log("cache invalidation enabled, varnish on ", serverOptions.varnish_host, ' ', serverOptions.varnish_port);
        Cache.init(serverOptions.varnish_host, serverOptions.varnish_port);
        serverOptions.afterStateChange = function(req, data, callback) {
            Cache.invalidate_db(req.params.dbname, req.params.table);
            callback(null, data);
        }
    }

    serverOptions.afterStyleChange = function(req, data, callback) {
        if ( req.params.hasOwnProperty('dbuser') ) {
          // also change the style of the anonim. request
          var params = _.extend(req.params); // make a copy here
          delete params.dbuser;
          var style = req.body.style;
          var that = this;
          this.setStyle(params, style, function(err, data) {
            if ( err ) callback(err, null);
            else that.afterStateChange(req, data, callback);
          });
        } else {
          callback(new Error("map style cannot be changed by unauthenticated request!"));
        }
    }

    serverOptions.afterStyleDelete = function(req, data, callback) {
        if ( req.params.hasOwnProperty('dbuser') ) {
          // also change the style of the anonim. request
          var params = _.extend(req.params); // make a copy here
          delete params.dbuser;
          var that = this;
          this.delStyle(params, function(err, data) {
            if ( err ) callback(err, null);
            else that.afterStateChange(req, data, callback);
          });
        } else {
          callback(new Error("map style cannot be deleted by unauthenticated request!"));
        }
    }



    // boot
    var ws = new Windshaft.Server(serverOptions);

    /**
     * Helper to allow access to the layer to be used in the maps infowindow popup.
     */
    ws.get(serverOptions.base_url + '/infowindow', function(req, res){
        Step(
            function(){
                serverOptions.getInfowindow(req, this);
            },
            function(err, data){
                if (err){
                    res.send(err.message, 500);
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
