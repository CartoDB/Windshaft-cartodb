'use strict';

//  - Reports stats about:
//    * Total number of renderers
//    * For mapnik renderers:
//      - the mapnik-pool status: count, unused and waiting
//      - the internally cached objects: png and grid

var _ = require('underscore');

function RendererStatsReporter(rendererCache, statsInterval) {
    this.rendererCache = rendererCache;
    this.statsInterval = statsInterval || 6e4;
    this.renderersStatsIntervalId = null;
}

module.exports = RendererStatsReporter;

RendererStatsReporter.prototype.start = function() {
    var self = this;
    this.renderersStatsIntervalId = setInterval(function() {
        var rendererCacheEntries = self.rendererCache.renderers;

        if (!rendererCacheEntries) {
            return null;
        }

        global.statsClient.gauge('windshaft.rendercache.count', _.keys(rendererCacheEntries).length);

        var renderersStats = _.reduce(rendererCacheEntries, function(_rendererStats, cacheEntry) {
                var stats = cacheEntry.renderer && cacheEntry.renderer.getStats && cacheEntry.renderer.getStats();
                if (!stats) {
                    return _rendererStats;
                }

                _rendererStats.pool.count += stats.pool.count;
                _rendererStats.pool.unused += stats.pool.unused;
                _rendererStats.pool.waiting += stats.pool.waiting;

                _rendererStats.cache.grid += stats.cache.grid;
                _rendererStats.cache.png += stats.cache.png;

                return _rendererStats;
            },
            {
                pool: {
                    count: 0,
                    unused: 0,
                    waiting: 0
                },
                cache: {
                    png: 0,
                    grid: 0
                }
            }
        );

        global.statsClient.gauge('windshaft.mapnik-cache.png', renderersStats.cache.png);
        global.statsClient.gauge('windshaft.mapnik-cache.grid', renderersStats.cache.grid);

        global.statsClient.gauge('windshaft.mapnik-pool.count', renderersStats.pool.count);
        global.statsClient.gauge('windshaft.mapnik-pool.unused', renderersStats.pool.unused);
        global.statsClient.gauge('windshaft.mapnik-pool.waiting', renderersStats.pool.waiting);
    }, this.statsInterval);

    this.rendererCache.on('err', rendererCacheErrorListener);
    this.rendererCache.on('gc', gcTimingListener);
};

function rendererCacheErrorListener() {
    global.statsClient.increment('windshaft.rendercache.error');
}

function gcTimingListener(gcTime) {
    global.statsClient.timing('windshaft.rendercache.gc', gcTime);
}

RendererStatsReporter.prototype.stop = function() {
    this.rendererCache.removeListener('err', rendererCacheErrorListener);
    this.rendererCache.removeListener('gc', gcTimingListener);

    clearInterval(this.renderersStatsIntervalId);
    this.renderersStatsIntervalId = null;
};
