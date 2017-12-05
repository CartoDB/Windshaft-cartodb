const AggregationProxy = require('../../aggregation/aggregation-proxy');
const { MapConfig } = require('windshaft').model;

const MISSING_AGGREGATION_COLUMNS = 'Missing columns in the aggregation. The map-config defines cartocss expressions,'+
' interactivity fields or attributes that are not present in the aggregation';

module.exports = class AggregationMapConfigAdapter {
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

        requestMapConfig.layers = this._adaptLayers(mapConfig, requestMapConfig);
        context.aggregation = {
            layers: this._getAggregationMetadata(requestMapConfig),
        };

        callback(null, requestMapConfig);
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

    _adaptLayers (mapConfig, requestMapConfig) {
        return requestMapConfig.layers.map(layer => {
            if (this._hasLayerAggregation(layer)) {
                const aggregation = new AggregationProxy(mapConfig, layer.options.aggregation);
                const sqlQueryWrap = layer.options.sql_wrap;

                let aggregationSql = aggregation.sql(layer.options);

                if (sqlQueryWrap) {
                    layer.options.sql_raw = aggregationSql;
                    aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                }

                layer.options.sql = aggregationSql;
            }

            return layer;
        });
    }

    _getAggregationMetadata (requestMapConfig) {
        return requestMapConfig.layers.map(layer => {
            return this._hasLayerAggregation(layer) ?
                { png: false, mvt: true } :
                { png: false, mvt: false };
        });
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
