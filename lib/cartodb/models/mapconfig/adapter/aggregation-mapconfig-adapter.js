const AggregationProxy = require('../../aggregation/aggregation-proxy');
const { MapConfig } = require('windshaft').model;
const queryUtils = require('../../../utils/query-utils');

const MISSING_AGGREGATION_COLUMNS = 'Missing columns in the aggregation. The map-config defines cartocss expressions,'+
' interactivity fields or attributes that are not present in the aggregation';
const unsupportedGeometryTypeErrorMessage = ctx =>
`Unsupported geometry type: ${ctx.geometryType}. Aggregation is available only for geometry type: ST_Point`;

module.exports = class AggregationMapConfigAdapter {
    constructor (pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        const mapConfig = new MapConfig(requestMapConfig);

        if (!this._shouldAdapt(mapConfig, params)) {
            return callback(null, requestMapConfig);
        }

        if (this._hasMissingColumns(mapConfig)) {
            const error = new Error(MISSING_AGGREGATION_COLUMNS);
            error.http_status = 400;
            error.type = 'mapconfig';

            return callback(error);
        }

        this.pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return callback(err);
            }

            this._adaptLayers(connection, mapConfig, requestMapConfig, context, callback);
        });
    }

    _hasMissingColumns (mapConfig) {
        const layers = mapConfig.getLayers();

        for (let index = 0; index < layers.length; index++) {
            const { aggregation } = layers[index].options;
            const aggregationColumns = this._getAggregationColumns(aggregation);
            const layerColumns = mapConfig.getColumnsByLayer(index);

            if (layerColumns.length === 0) {
                continue;
            }

            if (aggregationColumns.length === 0) {
                return true;
            }

            if (!this._haveSameColumns(aggregationColumns, layerColumns)) {
                return true;
            }
        }

        return false;
    }

    _haveSameColumns (aggregationColumns, layerColumns) {
        if (aggregationColumns.length !== layerColumns.length) {
            return false;
        }

        const diff = aggregationColumns.filter(column => !layerColumns.includes(column));

        return !diff.length;
    }

    _shouldAdapt (mapConfig, params) {
        const { aggregation } = params;

        if (aggregation === 'false') {
            return false;
        }

        if (aggregation === 'true') {
            return true;
        }

        if (mapConfig.isAggregationMapConfig()) {
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
                    const aggregation = new AggregationProxy(mapConfig, layer.options.sql, layer.options.aggregation);
                    const sqlQueryWrap = layer.options.sql_wrap;

                    let aggregationSql = aggregation.sql(layer.options);

                    if (sqlQueryWrap) {
                        layer.options.sql_raw = aggregationSql;
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

        const aggregationMetadata = queryUtils.getAggregationMetadata({ query: layer.options.sql });

        connection.query(aggregationMetadata, (err, res) => {
            if (err) {
                return callback(null, shouldAdapt);
            }

            const result = res.rows[0] || {};
            const estimatedFeatureCount = result.count;

            const threshold = layer.options.aggregation && layer.options.aggregation.threshold ?
                layer.options.aggregation.threshold :
                AggregationProxy.THRESHOLD;

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

    _getAggregationColumns (aggregation) {
        const hasAggregationColumns = aggregation !== undefined &&
            typeof aggregation !== 'boolean' &&
            typeof aggregation.columns === 'object';

        return hasAggregationColumns ? Object.keys(aggregation.columns) : [];
    }
};
