var camshaft = require('camshaft');
var fs = require('fs');

function AnalysisBackend (options) {
    options = options || {};
    this.setBatchConfig(options.batch);
    this.setLoggerConfig(options.logger);
}

module.exports = AnalysisBackend;

AnalysisBackend.prototype.setBatchConfig = function (options) {
    var batchConfig = options || {};
    batchConfig.endpoint = batchConfig.endpoint || 'http://127.0.0.1:8080/api/v1/sql/job';
    batchConfig.inlineExecution = batchConfig.inlineExecution || false;
    batchConfig.hostHeaderTemplate = batchConfig.hostHeaderTemplate || '{{=it.username}}.localhost.lan';
    this.batchConfig = batchConfig;
};

AnalysisBackend.prototype.setLoggerConfig = function (options) {
    var loggerConfig = options || {};

    loggerConfig.filename = loggerConfig.filename;

    this.loggerConfig = loggerConfig;

    if (this.loggerConfig.filename) {
        this.stream = fs.createWriteStream(this.loggerConfig.filename, { flags: 'a', encoding: 'utf8' });

        process.on('SIGHUP', function () {
            if (this.stream) {
                this.stream.destroy();
            }

            this.stream = fs.createWriteStream(this.loggerConfig.filename, { flags: 'a', encoding: 'utf8' });
        }.bind(this));
    }
};

AnalysisBackend.prototype.create = function(analysisConfiguration, analysisDefinition, callback) {
    analysisConfiguration.batch.endpoint = this.batchConfig.endpoint;
    analysisConfiguration.batch.inlineExecution = this.batchConfig.inlineExecution;
    analysisConfiguration.batch.hostHeaderTemplate = this.batchConfig.hostHeaderTemplate;

    analysisConfiguration.logger = {
        stream: this.stream ? this.stream : process.stdout
    };

    camshaft.create(analysisConfiguration, analysisDefinition, callback);
};
