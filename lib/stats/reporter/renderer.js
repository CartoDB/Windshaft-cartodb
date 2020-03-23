'use strict';

//  - Reports stats about:
//    * Total number of renderers
//    * For mapnik renderers:
//      - the mapnik-pool status: count, unused and waiting
//      - the internally cached objects: png and grid

function RendererStatsReporter (rendererCache, statsInterval) {
    this.rendererCache = rendererCache;
    this.statsInterval = statsInterval || 6e4;
    this.renderersStatsIntervalId = null;
}

module.exports = RendererStatsReporter;

RendererStatsReporter.prototype.start = function () {
    this.renderersStatsIntervalId = setInterval(() => {
        const rendererStats = this.rendererCache.getStats();

        for (const [stat, value] of rendererStats) {
            if (stat.startsWith('rendercache')) {
                global.statsClient.gauge(`windshaft.${stat}`, value);
            } else {
                global.statsClient.gauge(`windshaft.mapnik-${stat}`, value);
            }
        }
    }, this.statsInterval);

    this.rendererCache.on('err', rendererCacheErrorListener);
    this.rendererCache.on('gc', gcTimingListener);
};

function rendererCacheErrorListener () {
    global.statsClient.increment('windshaft.rendercache.error');
}

function gcTimingListener (gcTime) {
    global.statsClient.timing('windshaft.rendercache.gc', gcTime);
}

RendererStatsReporter.prototype.stop = function () {
    this.rendererCache.removeListener('err', rendererCacheErrorListener);
    this.rendererCache.removeListener('gc', gcTimingListener);

    clearInterval(this.renderersStatsIntervalId);
    this.renderersStatsIntervalId = null;
};
