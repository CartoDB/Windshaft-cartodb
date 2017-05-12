var windshaftStats = require('windshaft-stats');

function StatsBackend() {
}

module.exports = StatsBackend;

StatsBackend.prototype.getStats = function(mapConfig, dbConnection, callback) {
    var enabledFeatures = global.environment.enabledFeatures;
    var layerStatsEnabled = enabledFeatures ? enabledFeatures.layerStats: false;
    if (layerStatsEnabled) {
        var layerStats = windshaftStats();
        layerStats.getStats(mapConfig, dbConnection, callback);
    } else {
        return callback(null, null);
    }
};
