'use strict';

const queue = require('queue-async');

module.exports = class LayerStats {
    constructor (layerStatsIterator) {
        this.layerStatsIterator = layerStatsIterator;
    }

    getStats (mapConfig, dbConnection, callback) {
        const stats = [];

        if (!mapConfig.getLayers().length) {
            return callback(null, stats);
        }

        const metaQueue = queue(mapConfig.getLayers().length);

        mapConfig.getLayers().forEach((layer, layerId) => {
            const layerType = mapConfig.layerType(layerId);

            for (let i = 0; i < this.layerStatsIterator.length; i++) {
                if (this.layerStatsIterator[i].is(layerType)) {
                    const getStats = this.layerStatsIterator[i].getStats.bind(this.layerStatsIterator[i]);
                    metaQueue.defer(getStats, layer, dbConnection);
                    break;
                }
            }
        });

        metaQueue.awaitAll((err, results) => {
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
    }
};
