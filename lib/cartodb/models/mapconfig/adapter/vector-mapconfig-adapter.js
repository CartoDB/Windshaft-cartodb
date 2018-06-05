const queryUtils = require('../../../utils/query-utils');
const dateWrapper = require('../../../utils/date-wrapper');

/**
 * This middleware wraps the layer query transforming the date fields into numbers  because mvt tiles
 * doesnt support dates as primitive type.
 * 
 *  - This middleware is ONLY activated when the `dates_as_numbers` option is enabled for some layer in the mapConfig.
 *  - TODO: We currently support one single layer and we should define what to do with multiple layers.
 */
class VectorMapConfigAdapter {
    constructor(pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig(user, requestMapConfig, params, context, callback) {
        if (!this._isDatesAsNumbersFlagEnabled(requestMapConfig)) {
            return callback(null, requestMapConfig);
        }

        if (requestMapConfig.layers.length > 1) {
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
                const newSqlQuery = dateWrapper.wrapDates(originalQuery, result.fields);
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
                const query = queryUtils.getQueryLimited(originalQuery, 0);
                queryUtils.queryPromise(connection, query)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    _isDatesAsNumbersFlagEnabled(requestMapConfig) {
        return requestMapConfig.layers && requestMapConfig.layers.some(layer => layer.options.dates_as_numbers);
    }
}


module.exports = VectorMapConfigAdapter;