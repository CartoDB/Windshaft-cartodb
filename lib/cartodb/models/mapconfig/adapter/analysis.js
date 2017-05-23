var queue = require('queue-async');

function AnalysisMapConfigAdapter(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = AnalysisMapConfigAdapter;

AnalysisMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;
    context.analysesResults = [];

    if (!shouldRunAnalyses(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    var analysisConfiguration = context.analysisConfiguration;

    function createAnalysis(analysisDefinition, done) {
        self.analysisBackend.create(analysisConfiguration, analysisDefinition, function (err, analysis) {
            if (err) {
                var error = new Error(err.message);
                error.type = 'analysis';
                error.analysis = {
                    id: analysisDefinition.id,
                    node_id: err.node_id,
                    type: analysisDefinition.type
                };
                return done(error);
            }

            done(null, analysis);
        });
    }

    var analysesQueue = queue(1);
    requestMapConfig.analyses.forEach(function(analysis) {
        analysesQueue.defer(createAnalysis, analysis);
    });

    analysesQueue.awaitAll(function(err, analysesResults) {
        if (err) {
            return callback(err);
        }

        context.analysesResults = analysesResults;

        return callback(null, requestMapConfig);
    });
};

function shouldRunAnalyses(requestMapConfig) {
    return (Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0);
}
