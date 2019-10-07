'use strict';

var _ = require('underscore');
var camshaft = require('camshaft');
var fs = require('fs');

var REDIS_LIMITS = {
    DB: 5,
    PREFIX: 'limits:analyses:' // + username
};

function AnalysisBackend (metadataBackend, options) {
    this.metadataBackend = metadataBackend;
    this.options = options || {};
    this.options.limits = this.options.limits || {};
    this.setBatchConfig(this.options.batch);
    this.setLoggerConfig(this.options.logger);
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
    this.loggerConfig = options || {};

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

    this.getAnalysesLimits(analysisConfiguration.user, function(err, limits) {
        analysisConfiguration.limits = limits || {};
        camshaft.create(analysisConfiguration, analysisDefinition, callback);
    });
};

AnalysisBackend.prototype.getAnalysesLimits = function(username, callback) {
    var self = this;

    var analysesLimits = {
        analyses: {
            // buffer: {
            //     timeout: 1000,
            //     maxNumberOfRows: 1e6
            // }
        }
    };

    Object.keys(self.options.limits).forEach(function(analysisTypeOrTag) {
        analysesLimits.analyses[analysisTypeOrTag] = _.extend({}, self.options.limits[analysisTypeOrTag]);
    });

    var analysesLimitsKey = REDIS_LIMITS.PREFIX + username;
    this.metadataBackend.redisCmd(REDIS_LIMITS.DB, 'HGETALL', [analysesLimitsKey], function(err, analysesTimeouts) {
        // analysesTimeouts wil be something like: { moran: 3000, intersection: 5000 }
        analysesTimeouts = analysesTimeouts || {};

        Object.keys(analysesTimeouts).forEach(function(analysisType) {
            analysesLimits.analyses[analysisType] = _.defaults(
                {
                    timeout: Number.isFinite(+analysesTimeouts[analysisType]) ? +analysesTimeouts[analysisType] : 0
                },
                analysesLimits.analyses[analysisType]
            );
        });

        return callback(null, analysesLimits);
    });
};
