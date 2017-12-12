const AggregationProxy = require('../../aggregation/aggregation-proxy');
const { MapConfig } = require('windshaft').model;
const queryUtils = require('../../../utils/query-utils');

const MISSING_AGGREGATION_COLUMNS = 'Missing columns in the aggregation. The map-config defines cartocss expressions,'+
' interactivity fields or attributes that are not present in the aggregation';
const unsupportedGeometryTypeErrorMessage = ctx =>
`Unsupported geometry type (${ctx.geometryType}) for aggregation. Aggregation is available only for points.`;

module.exports = class AggregationMapConfigAdapter {
    constructor (pgConnection) {
        this.pgConnection = pgConnection;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        const mapConfig = new MapConfig(requestMapConfig);

        if (!this._shouldAdaptLayers(mapConfig, requestMapConfig, params)) {
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
        let missingColumns = false;

        for (let index = 0; index < layers.length; index++) {
            const layer = layers[index];
            const { aggregation } = layer.options;
            const aggregationColumns = this._getAggregationColumns(aggregation);
            const layerColumns = mapConfig.getColumnsByLayer(index);

            if (layerColumns.length === 0) {
                continue;
            }

            if (aggregationColumns.length === 0) {
                missingColumns = true;
                break;
            }

            if (!this._haveSameColumns(aggregationColumns,layerColumns)) {
                missingColumns = true;
                break;
            }
        }

        return missingColumns;
    }

    _haveSameColumns (aggregationColumns, layerColumns) {
        if (aggregationColumns.length !== layerColumns.length) {
            return false;
        }

        const diff = aggregationColumns.filter(column => !layerColumns.includes(column));

        return !diff.length;
    }

    _shouldAdaptLayers (mapConfig, requestMapConfig, params) {
        const { aggregation } = params;

        if (aggregation === 'false') {
            return false;
        }

        if (aggregation === 'true') {
            return true;
        }

        if (aggregation === undefined && mapConfig.isVectorOnlyMapConfig()) {
            return true;
        }

        if (aggregation === undefined && this._hasAnyLayerAggregation(requestMapConfig)){
            return true;
        }

        return false;
    }

    _hasAnyLayerAggregation (requestMapConfig) {
        for (const layer of requestMapConfig.layers) {
            if (this._hasLayerAggregation(layer)) {
                return true;
            }
        }

        return false;
    }

    _hasLayerAggregation (layer) {
        const { aggregation } = layer.options;
        return aggregation !== undefined && (typeof aggregation === 'object' || typeof aggregation === 'boolean');
    }

    _adaptLayers (connection, mapConfig, requestMapConfig, context, callback) {
        const isVectorOnlyMapConfig = mapConfig.isVectorOnlyMapConfig();
        const adaptLayerPromises = requestMapConfig.layers.map((layer, index) => {
            return this._adaptLayer(connection, layer, index, isVectorOnlyMapConfig, mapConfig);
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
                    const aggregatedFormats = this._getAggregationMetadata(isVectorOnlyMapConfig, layer, adapted);
                    context.aggregation.layers.push(aggregatedFormats);
                });

                callback(null, requestMapConfig);
            })
            .catch(err => callback(err));
    }

    _adaptLayer (connection, layer, index, isVectorOnlyMapConfig, mapConfig) {
        return new Promise((resolve, reject) => {
            this._shouldAdaptLayer(connection, layer, isVectorOnlyMapConfig, (err, shouldAdapt) => {
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

    _shouldAdaptLayer (connection, layer, isVectorOnlyMapConfig, callback) {
        let shouldAdapt = false;

        if (!isVectorOnlyMapConfig && !this._hasLayerAggregation(layer)) {
            return callback(null, shouldAdapt);
        }

        const aggregationMetadata = queryUtils.getAggregationMetadata({ query: layer.options.sql });

        connection.query(aggregationMetadata, (err, res) => {
            if (err) {
                return callback(null, shouldAdapt);
            }

            const estimatedFeatureCount = res.rows[0].count;

            const threshold = layer.options.aggregation && layer.options.aggregation.threshold ?
                layer.options.aggregation.threshold :
                1e5;

            if (estimatedFeatureCount < threshold) {
                return callback(null, shouldAdapt);
            }

            const geometryType = res.rows[0].type;

            if (geometryType !== 'ST_Point') {
                return callback(new Error(unsupportedGeometryTypeErrorMessage({ geometryType })));
            }

            shouldAdapt = true;

            callback(null, shouldAdapt);
        });
    }

    _getAggregationMetadata (isVectorOnlyMapConfig, layer, adapted) {
        if (!adapted) {
            return { png: false, mvt: false };
        }

        if (isVectorOnlyMapConfig) {
            return { png: false, mvt: true };
        }

        return { png: true, mvt: true };
    }

    _getAggregationColumns (aggregation) {
        const hasAggregationColumns = aggregation !== undefined &&
            typeof aggregation !== 'boolean' &&
            typeof aggregation.columns === 'object';
        let aggregationColumns = [];

        if (hasAggregationColumns) {
            aggregationColumns = Object.keys(aggregation.columns).map(key => {
                return aggregation.columns[key].aggregated_column;
            });
        }

        return aggregationColumns;
    }
};
