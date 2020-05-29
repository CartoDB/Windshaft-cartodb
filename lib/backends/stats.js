'use strict';

const layerStats = require('./layer-stats/factory');
const layer = layerStats();

module.exports = class StatsBackend {
    getStats (mapConfig, dbConnection, callback) {
        const enabledFeatures = global.environment.enabledFeatures;
        const layerStatsEnabled = enabledFeatures ? enabledFeatures.layerStats : false;

        if (!layerStatsEnabled) {
            return callback(null, []);
        }

        layer.getStats(mapConfig, dbConnection, callback);
    }
};
