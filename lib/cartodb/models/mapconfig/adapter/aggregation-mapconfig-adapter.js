const AggregationProxy = require('../../aggregation/aggregation-proxy');
const { MapConfig } = require('windshaft').model;

module.exports = class AggregationMapConfigAdapter {
    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this._shouldAdaptLayers(requestMapConfig, params)) {
            return callback(null, requestMapConfig);
        }

        requestMapConfig.layers = this._adaptLayers(requestMapConfig);

        callback(null, requestMapConfig);
    }

    _shouldAdaptLayers (requestMapConfig, params) {
        let shouldAdapt = false;

        if (typeof params.aggregation === 'boolean') {
            shouldAdapt = params.aggregation;
        }

        const mapConfig = new MapConfig(requestMapConfig);

        if (params.aggregation === undefined) {
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
        return aggregation !== undefined && (typeof aggregation === 'object' && typeof aggregation === 'boolean');
    }

    _adaptLayers (requestMapConfig) {
        return requestMapConfig.layers.map(layer => {
            if (this._hasLayerAggregation(layer)) {
                const aggregation = new AggregationProxy(requestMapConfig, layer.options.aggregation);

                let aggregationSql = aggregation.sql();

                const sqlQueryWrap = layer.options.sql_wrap;

                if (sqlQueryWrap) {
                    layer.options.sql_raw = aggregationSql;
                    aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
                }

                layer.options.sql = aggregationSql;
            }

            return layer;
        });
    }
};
