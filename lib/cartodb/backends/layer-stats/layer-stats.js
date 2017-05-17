var d3 = require('d3-queue');

function LayerStats(layerStatsIterator) {
    this.layerStatsIterator = layerStatsIterator;
}

LayerStats.prototype.getStats = function (mapConfig, dbConnection, callback) {
    var self = this;
    var stats = [];

    if (!mapConfig.getLayers().length) {
        return callback(null, stats);
    }
    var metaQueue = d3.queue(mapConfig.getLayers().length);
    mapConfig.getLayers().forEach(function (layer, layerId) {
        var layerType = mapConfig.layerType(layerId);

        for (var i = 0; i < self.layerStatsIterator.length; i++) {
            if (self.layerStatsIterator[i].is(layerType)) {
                var getStats = self.layerStatsIterator[i].getStats.bind(self.layerStatsIterator[i]);
                metaQueue.defer(getStats, layer, dbConnection);
                break;
            }
        }
    });

    metaQueue.awaitAll(function (err, results) {
        if (err) {
            return callback(err);
        }

        if (!results) {
            return callback(null, null);
        }

        mapConfig.getLayers().forEach(function (layer, layerIndex) {
            stats[layerIndex] = results[layerIndex];
        });

        return callback(err, stats);
    });

};

module.exports = LayerStats;
