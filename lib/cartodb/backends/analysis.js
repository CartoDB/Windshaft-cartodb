var camshaft = require('camshaft');

function AnalysisBackend(options) {
    var batchConfig = options.batch || {};
    batchConfig.endpoint = batchConfig.endpoint || 'http://127.0.0.1:8080/api/v1/sql/job';
    batchConfig.inlineExecution = batchConfig.inlineExecution || false;
    batchConfig.hostHeaderTemplate = batchConfig.hostHeaderTemplate || '{{=it.username}}.localhost.lan';
    this.batchConfig = batchConfig;
}

module.exports = AnalysisBackend;

AnalysisBackend.prototype.create = function(analysisConfiguration, analysisDefinition, callback) {
    analysisConfiguration.batch.endpoint = this.batchConfig.endpoint;
    analysisConfiguration.batch.inlineExecution = this.batchConfig.inlineExecution;
    analysisConfiguration.batch.hostHeaderTemplate = this.batchConfig.hostHeaderTemplate;

    camshaft.create(analysisConfiguration, analysisDefinition, callback);
};
