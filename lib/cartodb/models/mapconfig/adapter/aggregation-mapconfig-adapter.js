const AggregationProxy = require('../../aggregation/aggregation-proxy');
const { MapConfig } = require('windshaft').model;

module.exports = class AggregationMapConfigAdapter {
    getMapConfig (user, requestMapConfig, params, context, callback) {
        this.mapConfig = new MapConfig(requestMapConfig);

        if (!this._shouldAdaptLayers(requestMapConfig, params)) {
            return callback(null, requestMapConfig);
        }

        requestMapConfig.layers = this._adaptLayers(requestMapConfig);
        context.aggregation = {
            layers: this._getAggregationMetadata(requestMapConfig),
        };

        callback(null, requestMapConfig);
    }

    _shouldAdaptLayers (requestMapConfig, params) {
        let shouldAdapt = false;

        if (typeof params.aggregation === 'boolean') {
            shouldAdapt = params.aggregation;
        }

        if (params.aggregation === undefined) {
            if (this.mapConfig.isVectorOnlyMapConfig()) {
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

    _adaptLayers (requestMapConfig) {
        return requestMapConfig.layers.map(layer => {
            if (this._hasLayerAggregation(layer)) {
                const aggregation = new AggregationProxy(this.mapConfig, layer.options.aggregation);
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
                { aggregated: true } :
                { aggregated: false };
        });
    }
};
