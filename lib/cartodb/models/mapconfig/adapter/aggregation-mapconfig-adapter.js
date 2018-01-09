const AggregationMapConfig = require('../../aggregation/aggregation-mapconfig');
const queryUtils = require('../../../utils/query-utils');

const unsupportedGeometryTypeErrorMessage = ctx =>
`Unsupported geometry type: ${ctx.geometryType}. ` +
`Aggregation is available only for geometry type: ${AggregationMapConfig.SUPPORTED_GEOMETRY_TYPES}`;

const invalidAggregationParamValueErrorMessage = ctx =>
`Invalid value for 'aggregation' query param: ${ctx.value}. Valid ones are 'true' or 'false'`;

module.exports = class AggregationMapConfigAdapter {
    constructor (pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this._isValidAggregationQueryParam(params)) {
            return callback(new Error(invalidAggregationParamValueErrorMessage({ value: params.aggregation })));
        }

        let mapConfig;
        try {
            mapConfig = new AggregationMapConfig(user, requestMapConfig, this.pgConnection);
        } catch (err) {
            return callback(err);
        }


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

    _isValidAggregationQueryParam (params) {
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

                if (!shouldAdapt) {
                    return resolve({ layer, index, adapted: shouldAdapt });
                }

                const sqlQueryWrap = layer.options.sql_wrap;

                let aggregationSql = mapConfig.getAggregatedQuery(index);

                if (sqlQueryWrap) {
                    aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                }

                layer.options.sql = aggregationSql;

                mapConfig.getLayerAggregationColumns(index, (err, columns) => {
                    if (err) {
                        return reject(err);
                    }

                    layer.options.columns = columns;

                    return resolve({ layer, index, adapted: shouldAdapt });
                });
            });
        });
    }

    _shouldAdaptLayer (connection, mapConfig, layer, index, callback) {
        if (!mapConfig.isAggregationLayer(index)) {
            return callback(null, false);
        }

        const aggregationMetadata = queryUtils.getAggregationMetadata({
            query: layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql
        });

        connection.query(aggregationMetadata, (err, res) => {
            if (err) {
                return callback(null, false);
            }

            const result = res.rows[0] || {};

            if (!mapConfig.isVectorOnlyMapConfig() && !AggregationMapConfig.supportsGeometryType(result.type)) {
                const message = unsupportedGeometryTypeErrorMessage({ geometryType: result.type });
                const error = new Error(message);
                error.type = 'layer';
                error.layer = {
                    id: mapConfig.getLayerId(index),
                    index: index,
                    type: mapConfig.layerType(index)
                };

                return callback(error);
            }

            if (mapConfig.isVectorOnlyMapConfig() && !AggregationMapConfig.supportsGeometryType(result.type)) {
                return callback(null, false);
            }

            if (!mapConfig.doesLayerReachThreshold(index, result.count)) {
                return callback(null, false);
            }

            callback(null, true);
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
