var camshaft = require('camshaft');

function AnalysisBackend(options) {
    var batchConfig = options.batch || {};
    this.batchEndpoint = batchConfig.endpoint || 'http://127.0.0.1:8080/api/v1/sql/job';

    var databaseService = batchConfig.databaseService || null;
    this.analysisFactory = (databaseService === null) ? camshaft : new camshaft(databaseService);
}

module.exports = AnalysisBackend;

AnalysisBackend.prototype.create = function(analysisConfiguration, analysisDefinition, callback) {
    analysisConfiguration.batch.endpoint = this.batchEndpoint;
    this.analysisFactory.create(analysisConfiguration, analysisDefinition, callback);
};
