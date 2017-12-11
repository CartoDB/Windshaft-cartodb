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

        this._adaptLayers(user, mapConfig, requestMapConfig, context, callback);
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

        let shouldAdapt = false;

        if (aggregation === 'false') {
            shouldAdapt = false;
        } else if (aggregation === 'true') {
            shouldAdapt = true;
        } else if (aggregation === undefined) {
            if (mapConfig.isVectorOnlyMapConfig()) {
                shouldAdapt = true;
            } else if (this._hasAggregation(requestMapConfig)){
                shouldAdapt = true;
            }
        }

        return shouldAdapt;
    }

    _hasAggregation (requestMapConfig) {
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

    _adaptLayers (user, mapConfig, requestMapConfig, context, callback) {
        this.pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return callback(err);
            }

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

                    return requestMapConfig;
                })
                .then(requestMapConfig => callback(null, requestMapConfig))
                .catch(err => callback(err));
        });
    }

    _adaptLayer (connection, layer, index, isVectorOnlyMapConfig, mapConfig) {
        return new Promise((resolve, reject) => {
            if (!isVectorOnlyMapConfig && !this._hasLayerAggregation(layer)) {
                return resolve({ layer, index, adapted: false });
            }

            const threshold = layer.options.aggregation && layer.options.aggregation.threshold ?
                layer.options.aggregation.threshold :
                1e5;

            const aggregationMetadata = queryUtils.getAggregationMetadata({ query: layer.options.sql });

            connection.query(aggregationMetadata, (err, res) => {
                if (err) {
                    return resolve({ layer, index, adapted: false });
                }

                const estimatedFeatureCount = res.rows[0].count;
                const geometryType = res.rows[0].type;

                if (estimatedFeatureCount < threshold) {
                    return resolve({ layer, index, adapted: false });
                }

                if (geometryType !== 'ST_Point') {
                    return reject(new Error(unsupportedGeometryTypeErrorMessage({ geometryType })));
                }

                const aggregation = new AggregationProxy(mapConfig, layer.options.sql, layer.options.aggregation);
                const sqlQueryWrap = layer.options.sql_wrap;

                let aggregationSql = aggregation.sql(layer.options);

                if (sqlQueryWrap) {
                    layer.options.sql_raw = aggregationSql;
                    aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                }

                layer.options.sql = aggregationSql;

                return resolve({ layer, index, adapted: true });
            });
        });
    }

    _getAggregationMetadata (isVectorOnlyMapConfig, layer, adapted) {
        if (adapted) {
            if (isVectorOnlyMapConfig) {
                return { png: false, mvt: true };
            }

            return { png: true, mvt: true };
        }

        return { png: false, mvt: false };
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
