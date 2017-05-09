var windshaftStats = require('windshaft-stats');

function StatsBackend(rendererCache) {
    this.rendererCache = rendererCache;
};

module.exports = StatsBackend;

StatsBackend.prototype.getStats = function(params, dbConnection, mapConfigProvider, callback) {
    var layerStats = windshaftStats();
    layerStats.getStats(this.rendererCache, params, dbConnection, mapConfigProvider, callback);
};
