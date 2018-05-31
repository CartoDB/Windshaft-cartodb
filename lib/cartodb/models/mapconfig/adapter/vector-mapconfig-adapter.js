const AggregationMapConfig = require('../../aggregation/aggregation-mapconfig');
const utilsService = require('../../../utils/get-column-types');
const queryUtils = require('../../../utils/query-utils');

// Generate query to detect time columns
// For every column cast to unix timestamp
module.exports = class VectorMapConfigAdapter {
    constructor(pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig(user, requestMapConfig, params, context, callback) {
        let mapConfig;
        try {
            mapConfig = new AggregationMapConfig(user, requestMapConfig, this.pgConnection);
        } catch (err) {
            return callback(err);
        }

        if (!mapConfig.isVectorOnlyMapConfig()) {
            return callback(null, requestMapConfig);
        }

        if (requestMapConfig.layers.lenght > 1) {
            return callback(new Error('Get column types for multiple vector layers is not implemented'));
        }


        this._wrapDates(requestMapConfig, user)
            .then(updatedRequestMapConfig => callback(null, updatedRequestMapConfig))
            .catch(callback);
    }

    _wrapDates(requestMapConfig, user) {
        const originalQuery = requestMapConfig.layers[0].options.sql;
        return this._getColumns(user, originalQuery)
            .then(result => {
                const newSqlQuery = utilsService.wrapDates(originalQuery, result.fields);
                requestMapConfig.layers[0].options.sql = newSqlQuery;
                return requestMapConfig;
            });
    }

    _getColumns(user, originalQuery) {
        return new Promise((resolve, reject) => {
            this.pgConnection.getConnection(user, (err, connection) => {
                if (err) {
                    return reject(err);
                }
                const query = `SELECT * FROM (${originalQuery}) _cdb_column_type limit 0`;
                queryUtils.queryPromise(connection, query)
                    .then(resolve)
                    .catch(reject);
                // TODO release pgConnection
            });
        });
    }
};