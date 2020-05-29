'use strict';

const AnalysisFilter = require('../models/filter/analysis');

module.exports = class FilterStatsBackends {
    constructor (pgQueryRunner) {
        this._pgQueryRunner = pgQueryRunner;
    }

    getFilterStats (username, unfilteredQuery, filters, callback) {
        const stats = {};

        getEstimatedRows(this._pgQueryRunner, username, unfilteredQuery, (err, rows) => {
            if (err) {
                return callback(err);
            }

            stats.unfiltered_rows = rows;

            if (!filters || Object.entries(filters).length === 0) {
                return callback(null, stats);
            }

            const analysisFilter = new AnalysisFilter(filters);
            const query = analysisFilter.sql(unfilteredQuery);

            getEstimatedRows(this._pgQueryRunner, username, query, (err, rows) => {
                if (err) {
                    return callback(err);
                }

                stats.filtered_rows = rows;

                return callback(null, stats);
            });
        });
    }
};

function getEstimatedRows (pgQueryRunner, username, query, callback) {
    const explainQuery = `EXPLAIN (FORMAT JSON) ${query}`;

    pgQueryRunner.run(username, explainQuery, (err, resultRows) => {
        if (err) {
            return callback(err);
        }

        let rows;

        if (resultRows[0] && resultRows[0]['QUERY PLAN'] && resultRows[0]['QUERY PLAN'][0] && resultRows[0]['QUERY PLAN'][0].Plan) {
            rows = resultRows[0]['QUERY PLAN'][0].Plan['Plan Rows'];
        }

        return callback(null, rows);
    });
}
