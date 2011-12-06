
var _ = require('underscore')
    , Step       = require('step')
    , Windshaft = require('windshaft')
    , Cache = require('./cache_validator')

var CartodbWindshaft = function(serverOptions) {

    // set the cache chanel info to invalidate the cache on the frontend server
    serverOptions.afterTileRender = function(req, res, tile, headers, callback) {
        res.header('X-Cache-Channel', req.params.dbname);
        // note - may not be invalidating properly
        res.header('Last-Modified', new Date().toUTCString());
        res.header('Cache-Control', 'no-cache,max-age=3600,must-revalidate, public');
        callback(null, tile, headers);
    };

    if(serverOptions.cache_enabled) {
        console.log("cache invalidation enabled, varnish on ", serverOptions.varnish_host, ' ', serverOptions.varnish_port);
        Cache.init(serverOptions.varnish_host, serverOptions.varnish_port);
        serverOptions.afterStateChange = function(req, data, callback) {
            Cache.invalidate_db(req.params.dbname);
            callback(null, data);
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

    return ws;
}

module.exports = CartodbWindshaft;
