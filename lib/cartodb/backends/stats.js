var windshaftStats = require('windshaft-stats');

function StatsBackend() {
}

module.exports = StatsBackend;

StatsBackend.prototype.getStats = function(mapConfig, params, dbConnection, callback) {
    var enabledFeatures = global.environment.enabledFeatures;
    var layerStatsEnabled = enabledFeatures ? enabledFeatures.layerStats: false;
    if (layerStatsEnabled) {
        var layerStats = windshaftStats();
        layerStats.getStats(mapConfig, params, dbConnection, callback);
    } else {
        callback(null, null);
    }
};
