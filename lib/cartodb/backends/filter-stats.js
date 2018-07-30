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
    var self = this;

    getEstimatedRows(self.pgQueryRunner, username, unfiltered_query, function (err, rows) {
        if (err){
            return callback(err);
        }

        stats.unfiltered_rows = rows;
    })
    function getFilteredRows() {
        if ( filters && !_.isEmpty(filters)) {
            var analysisFilter = new AnalysisFilter(filters);
            var query = analysisFilter.sql(unfiltered_query);
            getEstimatedRows(self.pgQueryRunner, username, query, this);
        } else {
            this(null, null);
        }
    },
    function receiveFilteredRows(err, rows) {
        if (err){
            callback(err);
            return;
        }
        stats.filtered_rows = rows;
        callback(null, stats);
    }
};
