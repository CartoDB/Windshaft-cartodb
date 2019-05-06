'use strict';

const AggregationMapConfig = require('../../aggregation/aggregation-mapconfig');
const queryUtils = require('../../../utils/query-utils');

const unsupportedGeometryTypeErrorMessage = ctx => [
    `Unsupported geometry type: ${ctx.geometryType}.`,
    `Aggregation is available only for geometry type: ${AggregationMapConfig.SUPPORTED_GEOMETRY_TYPES}`
].join(' ');

const invalidAggregationParamValueErrorMessage = ctx => [
    `Invalid value for 'aggregation' query param: ${ctx.value}.`,
    `Valid ones are 'true' or 'false'`
].join(' ');

module.exports = class AggregationMapConfigAdapter {
    constructor (pgConnection, filterStatsBackend, options) {
        this.pgConnection = pgConnection;
        this.filterStatsBackend = filterStatsBackend;
        this.options = options;
    }

    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this.options.enabled) {
            return callback(null, requestMapConfig);
        }

        if (!this._isValidAggregationQueryParam(params)) {
            return callback(new Error(invalidAggregationParamValueErrorMessage({ value: params.aggregation })));
        }

        if (!this._shouldAdapt(params)) {
            return callback(null, requestMapConfig);
        }

        let mapConfig;
        try {
            mapConfig = new AggregationMapConfig(user, requestMapConfig, this.pgConnection, this.options.threshold);
        } catch (err) {
            return callback(err);
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

    _shouldAdapt (params) {
        const { aggregation } = params;

        if (aggregation === 'false') {
            return false;
        }

        return true;
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
                    const aggregatedFormats = this._getAggregationMetadata(mapConfig, layer, index, adapted);
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

                let aggregationSql;

                try {
                    aggregationSql = mapConfig.getAggregatedQuery(index);
                }
                catch (error) {
                    return reject(error);
                }

                if (sqlQueryWrap) {
                    aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                }

                if (!layer.options.sql_raw) {
                    // if sql_wrap is present, the original query should already be
                    // in sql_raw (with sql being the wrapped query);
                    // otherwise we keep the now the original query in sql_raw
                    layer.options.sql_raw = layer.options.sql;
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
        const aggregationMetadata = queryUtils.getAggregationMetadata({
            query: layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql,
            geometryColumn: AggregationMapConfig.getAggregationGeometryColumn()
        });

        connection.query(aggregationMetadata, (err, res) => {
            // jshint maxcomplexity:7
            if (err) {
                return callback(null, false);
            }

            const result = res.rows[0] || {};

            if (!mapConfig.isAggregationLayer(index, result.count)) {
                return callback(null, false);
            }

            if (mapConfig.hasNoAggregationDefined(index) && layer.options.sql_wrap) {
                return callback(null, false);
            }

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

            callback(null, true);
        });
    }

    _getAggregationMetadata (mapConfig, layer, index, adapted) {
        // also: pre-aggr query, columns, ...
        const isDefaultAgg = adapted && mapConfig.hasNoAggregationOrWithoutOptions(index);
        const hasOutputChanged = adapted && mapConfig.hasColumnsDefined(index);

        if (!adapted) {
            return { isDefaultAgg, hasOutputChanged, png: false, mvt: false};
        }

        if (mapConfig.isVectorOnlyMapConfig()) {
            return { isDefaultAgg, hasOutputChanged, png: false, mvt: true };
        }

        return { isDefaultAgg, hasOutputChanged, png: true, mvt: true };
    }
};
