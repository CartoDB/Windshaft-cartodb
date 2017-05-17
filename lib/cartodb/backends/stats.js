var layerStats = require('./layer-stats/factory');

function StatsBackend() {
}

module.exports = StatsBackend;

StatsBackend.prototype.getStats = function(mapConfig, dbConnection, callback) {
    var enabledFeatures = global.environment.enabledFeatures;
    var layerStatsEnabled = enabledFeatures ? enabledFeatures.layerStats: false;
    if (layerStatsEnabled) {
        layerStats().getStats(mapConfig, dbConnection, callback);
    } else {
        return callback(null, null);
    }
};
