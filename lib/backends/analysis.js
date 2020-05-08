'use strict';

const camshaft = require('camshaft');
const fs = require('fs');

const REDIS_LIMITS = {
    DB: 5,
    PREFIX: 'limits:analyses' // + username
};

module.exports = class AnalysisBackend {
    constructor (metadataBackend, options) {
        this.metadataBackend = metadataBackend;
        this.options = options || {};
        this.options.limits = this.options.limits || {};
        this.setBatchConfig(this.options.batch);
        this.setLoggerConfig(this.options.logger);
    }

    setBatchConfig (config = {}) {
        const batchConfig = config;
        // TODO: use Object.assign instead
        batchConfig.endpoint = batchConfig.endpoint || 'http://127.0.0.1:8080/api/v1/sql/job';
        batchConfig.inlineExecution = batchConfig.inlineExecution || false;
        batchConfig.hostHeaderTemplate = batchConfig.hostHeaderTemplate || '{{=it.username}}.localhost.lan';
        this.batchConfig = batchConfig;
    }

    setLoggerConfig (options = {}) {
        this.loggerConfig = options;

        if (this.loggerConfig.filename) {
            this.stream = fs.createWriteStream(this.loggerConfig.filename, { flags: 'a', encoding: 'utf8' });

            process.on('SIGHUP', () => {
                if (this.stream) {
                    this.stream.destroy();
                }

                this.stream = fs.createWriteStream(this.loggerConfig.filename, { flags: 'a', encoding: 'utf8' });
            });
        }
    }

    create (analysisConfiguration, analysisDefinition, callback) {
        analysisConfiguration.batch.endpoint = this.batchConfig.endpoint;
        analysisConfiguration.batch.inlineExecution = this.batchConfig.inlineExecution;
        analysisConfiguration.batch.hostHeaderTemplate = this.batchConfig.hostHeaderTemplate;

        analysisConfiguration.logger = {
            stream: this.stream ? this.stream : process.stdout
        };

        this.getAnalysesLimits(analysisConfiguration.user, (err, limits) => {
            if (err) {}
            analysisConfiguration.limits = limits || {};
            camshaft.create(analysisConfiguration, analysisDefinition, callback);
        });
    }

    getAnalysesLimits (username, callback) {
        const analysesLimits = {
            analyses: {
                // buffer: {
                //     timeout: 1000,
                //     maxNumberOfRows: 1e6
                // }
            }
        };

        Object.keys(this.options.limits).forEach((analysisTypeOrTag) => {
            analysesLimits.analyses[analysisTypeOrTag] = Object.assign({}, this.options.limits[analysisTypeOrTag]);
        });

        const analysesLimitsKey = `${REDIS_LIMITS.PREFIX}:${username}`;
        this.metadataBackend.redisCmd(REDIS_LIMITS.DB, 'HGETALL', [analysesLimitsKey], (err, analysesTimeouts) => {
            if (err) {
                global.logger.error(err);
                return callback(null, analysesLimits);
            }

            analysesTimeouts = analysesTimeouts || {};

            // analysesTimeouts wil be something like: { moran: 3000, intersection: 5000 }
            Object.keys(analysesTimeouts).forEach((analysisType) => {
                analysesLimits.analyses[analysisType] = Object.assign(analysesLimits.analyses[analysisType] || {}, {
                    timeout: Number.isFinite(+analysesTimeouts[analysisType]) ? +analysesTimeouts[analysisType] : 0
                });
            });

            return callback(null, analysesLimits);
        });
    }
};
