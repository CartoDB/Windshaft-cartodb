'use strict';

var _ = require('underscore');
var AnalysisFilter = require('../models/filter/analysis');

function FilterStatsBackends (pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = FilterStatsBackends;

function getEstimatedRows (pgQueryRunner, username, query, callback) {
    pgQueryRunner.run(username, 'EXPLAIN (FORMAT JSON)' + query, function (err, resultRows) {
        if (err) {
            callback(err);
            return;
        }
        var rows;
        if (resultRows[0] && resultRows[0]['QUERY PLAN'] &&
             resultRows[0]['QUERY PLAN'][0] && resultRows[0]['QUERY PLAN'][0].Plan) {
            rows = resultRows[0]['QUERY PLAN'][0].Plan['Plan Rows'];
        }
        return callback(null, rows);
    });
}

FilterStatsBackends.prototype.getFilterStats = function (username, unfilteredQuery, filters, callback) {
    var stats = {};

    getEstimatedRows(this.pgQueryRunner, username, unfilteredQuery, (err, rows) => {
        if (err) {
            return callback(err);
        }

        stats.unfiltered_rows = rows;

        if (!filters || _.isEmpty(filters)) {
            return callback(null, stats);
        }

        var analysisFilter = new AnalysisFilter(filters);
        var query = analysisFilter.sql(unfilteredQuery);

        getEstimatedRows(this.pgQueryRunner, username, query, (err, rows) => {
            if (err) {
                return callback(err);
            }

            stats.filtered_rows = rows;
            return callback(null, stats);
        });
    });
};
