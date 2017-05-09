var windshaftStats = require('windshaft-stats');

function StatsBackend(rendererCache) {
    this.rendererCache = rendererCache;
}

module.exports = StatsBackend;

StatsBackend.prototype.getStats = function(params, dbConnection, mapConfigProvider, callback) {
    var enabledFeatures = global.environment.enabledFeatures;
    var layerMetadataEnabled = enabledFeatures ? enabledFeatures.layerMetadata : false;
    var layerStats;
    if (layerMetadataEnabled) {
        layerStats = windshaftStats();
        layerStats.getStats(this.rendererCache, params, dbConnection, mapConfigProvider, callback);
    } else {
        layerStats = windshaftStats('torque');
        layerStats.getStats(this.rendererCache, params, dbConnection, mapConfigProvider, callback);
    }
};
