// tile cache policies
// it exports two cache types:
// 'nocache' implements a pass-troguth cache
// 'lru' implements a LRU cache

var LRUCache       = require('./lru'),
    CacheValidator = require('./cache_validator'),
    TTL            = require('./TTL');

var BLANK_TILE_SIZE = 334; // totally transparent tile size in bytes

module.exports.NoCache = function() {

    var me = {}

    me.beforeTileRender = function(req, res, callback) {
        callback(null);
    }

    me.afterTileRender = function(req, res, tile, headers, callback) {
        callback(null, tile, headers);
    }

    return me;

}

module.exports.LRUcache = function(max_items, redis_opts) {
    var cache_validator = CacheValidator(redis_opts);
    return GenericCache(new LRUCache(max_items), cache_validator);
}

// implements a generic cache for tile
// cache_policy should implement set and get methods and optionally getStats
function GenericCache (cache_policy, cache_validator, ttl_timeout) {

    var me = {
        cache: cache_policy,
        cache_validator: cache_validator,
        cache_hits: 0,
        cache_misses: 0,
        cache_not_modified: 0,
        current_items: 0,
        expired: 0,
        cache_invalidated: 0,
        max_items: 0
    };

    // enable ttl
    var ttl = TTL(function(key) {
        me.remove(key);
        me.expired++;
    }, ttl_timeout || 60);

    function cache_key(req) {
        return req.url;
    }

    function update_items(n) {
        me.current_items = n;
        if(n > me.max_items) {
            me.max_items = n;
        }
    }

    me.remove = function(key) {
        ttl.remove(key);
        me.cache.remove(key);
        update_items(me.cache.size || 0);
    }

    me.beforeTileRender = function(req, res, callback) {
        req.windshaft_start = new Date().getTime();
        var key = cache_key(req);
        var tile = me.cache.get(key);
        if(tile) {
            // validate the cache
            me.cache_validator.getTimestamp(req.params.dbname, req.params.table, function(err, t) {
                if(t !== null && tile.timestamp < t) {
                    me.cache_misses++;
                    me.cache_invalidated++;
                    callback(null);
                } else {
                    // stats
                    me.cache_hits++;
                    var timestamp = new Date().getTime();
                    var delta = timestamp - req.windshaft_start;
                    tile.cache_time = delta/1000.0;
                    tile.hits++;
                    res.header('X-Cache-hit', 'true');
                    res.header('Last-Modified', new Date(tile.timestamp*1000).toGMTString());
                    // check 304
                    var modified_since = req.header('if-modified-since');
                    if (modified_since) {
                        modified_since = Date.parse(modified_since);
                        if(modified_since && modified_since <= timestamp*1000) {
                            me.cache_not_modified++;
                            res.send(304);
                            return;
                        }
                    }
                    res.send(tile.tile, tile.headers, 200);
                }
            });
        } else {
            me.cache_misses++;
            callback(null);
        }
    }

    me.afterTileRender = function(req, res, tile, headers, callback) {
        var timestamp = new Date().getTime();
        var delta = timestamp - req.windshaft_start;
        var key = cache_key(req);
        me.cache.put(key, {
                tile: tile,
                headers: headers,
                timestamp: timestamp/1000.0,
                render_time: delta/1000.0,
                hits: 0});
        ttl.start(key);
        update_items(me.cache.size || 0);
        callback(null, tile, headers);
    }

    me.afterStateChange = function(req, data, callback) {
        me.cache_validator.setTimestamp(req.params.dbname, req.params.table, new Date().getTime()/1000.0, function(err, t) {
            callback(err, data);
        });
    }

    me.getStats = function(include_tile_info, sort_by) {
        var total = me.cache_hits + me.cache_misses;
        var mem = 0;
        var blank_tile_count = 0;
        var tile_info = []
        me.cache.forEach(function(key, value) {
            if(value.tile.length !== undefined) {
                mem += value.tile.length;
                if(value.tile.length == BLANK_TILE_SIZE) {
                    blank_tile_count++;
                }
            }
            if(include_tile_info) {
                tile_info.push({
                    key: key,
                    length: value.tile.length,
                    hits: value.hits,
                    render_time: value.render_time,
                    cache_time: value.cache_time
                });
            }
        });
        sort_by = sort_by || 'hits';
        tile_info.sort(function(a, b) {
            return b[sort_by] - a[sort_by];
        });
        return  {
             cache_hits: me.cache_hits,
             cache_misses: me.cache_misses,
             cache_invalidated: me.cache_invalidated,
             cache_not_modified: me.cache_not_modified,
             current_items: me.current_items,
             max_items: me.max_items,
             memory: mem,
             memory_per_item: total ? mem/total: 0,
             ratio: total ? me.cache_hits/total: 0,
             blank_tile_count: blank_tile_count,
             blank_tile_size: blank_tile_count*BLANK_TILE_SIZE,
             blank_items_ratio: total? blank_tile_count/total: 0,
             tiles: tile_info
        };
    }

   return me;
}
