'use strict';

const queryUtils = require('../../../utils/query-utils');
const dateWrapper = require('../../../utils/date-wrapper');

/**
 * This middleware wraps the layer query transforming the date fields into numbers  because mvt tiles
 * doesnt support dates as primitive type.
 *
 *  - This middleware is ONLY activated when the `dates_as_numbers` option is enabled for some layer in the mapConfig.
 */
class VectorMapConfigAdapter {
    constructor (pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this._isDatesAsNumbersFlagEnabled(requestMapConfig)) {
            return callback(null, requestMapConfig);
        }

        this._wrapDates(requestMapConfig, user)
            .then(updatedRequestMapConfig => callback(null, updatedRequestMapConfig))
            .catch(callback);
    }

    _wrapDates (requestMapConfig, user) {
        return Promise.all(requestMapConfig.layers.map(layer => this._wrapLayer(layer, user)))
            .then(() => requestMapConfig);
    }

    _wrapLayer (layer, user) {
        if (!layer.options.dates_as_numbers || !layer.options.sql) {
            return Promise.resolve(layer);
        }
        const originalQuery = layer.options.sql;
        return this._getColumns(user, originalQuery)
            .then(result => {
                const newSqlQuery = dateWrapper.wrapDates(originalQuery, result.fields);
                layer.options.sql = newSqlQuery;
                return layer;
            });
    }

    _getColumns (user, originalQuery) {
        return new Promise((resolve, reject) => {
            this.pgConnection.getConnection(user, (err, connection) => {
                if (err) {
                    return reject(err);
                }
                const query = queryUtils.getQueryLimited(queryUtils.substituteDummyTokens(originalQuery), 0);
                queryUtils.queryPromise(connection, query)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    _isDatesAsNumbersFlagEnabled (requestMapConfig) {
        return requestMapConfig.layers && requestMapConfig.layers.some(layer => layer.options.dates_as_numbers);
    }
}

module.exports = VectorMapConfigAdapter;
