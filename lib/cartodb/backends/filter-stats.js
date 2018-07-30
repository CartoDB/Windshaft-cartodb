var _ = require('underscore');
var AnalysisFilter = require('../models/filter/analysis');

function FilterStatsBackends(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = FilterStatsBackends;

function getEstimatedRows(pgQueryRunner, username, query, callback) {
    pgQueryRunner.run(username, "EXPLAIN (FORMAT JSON)"+query, function(err, result_rows) {
        if (err){
            callback(err);
            return;
        }
        var rows;
        if ( result_rows[0] && result_rows[0]['QUERY PLAN'] &&
             result_rows[0]['QUERY PLAN'][0] && result_rows[0]['QUERY PLAN'][0].Plan ) {
            rows = result_rows[0]['QUERY PLAN'][0].Plan['Plan Rows'];
        }
        return callback(null, rows);
    });
}

FilterStatsBackends.prototype.getFilterStats = function (username, unfiltered_query, filters, callback) {
    var stats = {};

    getEstimatedRows(this.pgQueryRunner, username, unfiltered_query, (err, rows) => {
        if (err){
            return callback(err);
        }

        stats.unfiltered_rows = rows;

        if ( filters && !_.isEmpty(filters)) {
            var analysisFilter = new AnalysisFilter(filters);
            var query = analysisFilter.sql(unfiltered_query);

            getEstimatedRows(this.pgQueryRunner, username, query, (err, rows) => {
                if (err){
                    return callback(err);
                }

                stats.filtered_rows = rows;
                return callback(null, stats);
            });

        } else {
            return callback(null, stats);
        }
    });
};
