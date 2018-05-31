const AggregationMapConfig = require('../../aggregation/aggregation-mapconfig');
const utilsService = require('../../../utils/get-column-types');

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


        // // Get columns
        utilsService.getColumns(user, this.pgConnection, requestMapConfig.layers[0])
            .then(result => {
                const newSqlQuery = utilsService.wrapDates(requestMapConfig.layers[0].options.sql, result.fields);
                requestMapConfig.layers[0].options.sql = newSqlQuery;
                return callback(null, requestMapConfig);
            })
            .catch(err => {
                return callback(err);
            });
    }
};
