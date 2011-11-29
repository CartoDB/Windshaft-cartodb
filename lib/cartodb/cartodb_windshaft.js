
var _ = require('underscore')
    , Step       = require('step')
    , Windshaft = require('windshaft')
    , Cache       = require('./tile_cache');

var CartodbWindshaft = function(serverOptions) {

    // set cache if requested
    if(serverOptions.lru_cache) {
        var lru_cache = Cache.LRUcache(serverOptions.lru_cache_size || 10000,
                serverOptions.redis,
                serverOptions.ttl_timeout);
        _.extend(serverOptions, {
            beforeTileRender: lru_cache.beforeTileRender,
            afterTileRender: lru_cache.afterTileRender,
            cacheStats: lru_cache.getStats,
            afterStateChange: lru_cache.afterStateChange
        });
    }

    // set the cache chanel info to invalidate the cache on the frontend server
    serverOptions.afterTileRender = function(req, res, tile, headers, callback) {
        res.header('X-Cache-Channel', req.params.dbname);
        callback(null, tile, headers);
    };

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
     * tile cache stats
     */
    ws.get('/cache', function(req, res){
        if(serverOptions.cacheStats) {
            res.send(serverOptions.cacheStats(req.query.tile_info, req.query.sort_by));
        } else {
            res.send("Cache no enabled")
        }
    });
    
    return ws;
}

module.exports = CartodbWindshaft;
