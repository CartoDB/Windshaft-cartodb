const Aggregation = require('../../aggregation/aggregation');
const AggregationMapConfig = require('../../aggregation/aggregation-map-config');
const queryUtils = require('../../../utils/query-utils');

const unsupportedGeometryTypeErrorMessage = ctx =>
`Unsupported geometry type: ${ctx.geometryType}. Aggregation is available only for geometry type: ST_Point`;

const invalidAggregationParamValueErrorMessage = ctx =>
`Invalid value for 'aggregation' query param: ${ctx.value}. Valid ones are 'true' or 'false'`;

module.exports = class AggregationMapConfigAdapter {
    constructor (pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this._isValidAggregationParam(params)) {
            return callback(new Error(invalidAggregationParamValueErrorMessage({ value: params.aggregation })));
        }

        const mapConfig = new AggregationMapConfig(requestMapConfig);

        if (!this._shouldAdapt(mapConfig, params)) {
            return callback(null, requestMapConfig);
        }

        this.pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return callback(err);
            }

            this._adaptLayers(connection, mapConfig, requestMapConfig, context, callback);
        });
    }

    _isValidAggregationParam (params) {
        const { aggregation } = params;
        return aggregation === undefined || aggregation === 'true' || aggregation === 'false';
    }

    _shouldAdapt (mapConfig, params) {
        const { aggregation } = params;

        if (aggregation === 'false') {
            return false;
        }

        if (aggregation === 'true' || mapConfig.isAggregationMapConfig()) {
            return true;
        }

        return false;
    }

    _adaptLayers (connection, mapConfig, requestMapConfig, context, callback) {
        const adaptLayerPromises = requestMapConfig.layers.map((layer, index) => {
            return this._adaptLayer(connection, mapConfig, layer, index);
        });

        Promise.all(adaptLayerPromises)
            .then(results => {
                context.aggregation = {
                    layers: []
                };

                results.forEach(({ layer, index, adapted }) => {
                    if (adapted) {
                        requestMapConfig.layers[index] = layer;
                    }
                    const aggregatedFormats = this._getAggregationMetadata(mapConfig, layer, adapted);
                    context.aggregation.layers.push(aggregatedFormats);
                });

                callback(null, requestMapConfig);
            })
            .catch(err => callback(err));
    }

    _adaptLayer (connection, mapConfig, layer, index) {
        return new Promise((resolve, reject) => {
            this._shouldAdaptLayer(connection, mapConfig, layer, index, (err, shouldAdapt) => {
                if (err) {
                    return reject(err);
                }

                if (shouldAdapt) {
                    const sql = layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql;
                    const aggregation = new Aggregation(mapConfig, sql, layer.options.aggregation);
                    const sqlQueryWrap = layer.options.sql_wrap;

                    let aggregationSql = aggregation.sql();

                    if (sqlQueryWrap) {
                        aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                    }

                    layer.options.sql = aggregationSql;
                }

                return resolve({ layer, index, adapted: shouldAdapt });
            });
        });
    }

    _shouldAdaptLayer (connection, mapConfig, layer, index, callback) {
        let shouldAdapt = false;

        if (!mapConfig.isAggregationLayer(index)) {
            return callback(null, shouldAdapt);
        }

        const aggregationMetadata = queryUtils.getAggregationMetadata({
            query: layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql
        });

        connection.query(aggregationMetadata, (err, res) => {
            if (err) {
                return callback(null, shouldAdapt);
            }

            const result = res.rows[0] || {};
            const estimatedFeatureCount = result.count;

            const threshold = layer.options.aggregation && layer.options.aggregation.threshold ?
                layer.options.aggregation.threshold :
                Aggregation.THRESHOLD;

            if (estimatedFeatureCount < threshold) {
                return callback(null, shouldAdapt);
            }

            const geometryType = result.type;

            if (geometryType !== 'ST_Point') {
                return callback(new Error(unsupportedGeometryTypeErrorMessage({ geometryType })));
            }

            shouldAdapt = true;

            callback(null, shouldAdapt);
        });
    }

    _getAggregationMetadata (mapConfig, layer, adapted) {
        if (!adapted) {
            return { png: false, mvt: false };
        }

        if (mapConfig.isVectorOnlyMapConfig()) {
            return { png: false, mvt: true };
        }

        return { png: true, mvt: true };
    }
};
