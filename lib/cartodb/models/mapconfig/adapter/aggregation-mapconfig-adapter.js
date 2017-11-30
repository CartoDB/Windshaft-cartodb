const AggregationProxy = require('../../aggregation/aggregation-proxy');

module.exports = class AggregationMapConfigAdapter {
    getMapConfig (user, requestMapConfig, params, context, callback) {
        if (!this._shouldAdaptLayers(requestMapConfig, params)) {
            return callback(null, requestMapConfig);
        }

        requestMapConfig.layers.forEach(layer => {
            if (!this._hasLayerAggregation(layer)) {
                return;
            }

            const aggregation = new AggregationProxy(requestMapConfig, layer.options.aggregation);

            let aggregationSql = aggregation.sql();

            const sqlQueryWrap = layer.options.sql_wrap;

            if (sqlQueryWrap) {
                layer.options.sql_raw = aggregationSql;
                aggregationSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, aggregationSql);
            }

            layer.options.sql = aggregationSql;
        });

        callback(null, requestMapConfig);
    }

    _shouldAdaptLayers (requestMapConfig, params) {
        if (typeof params.aggregation === 'boolean') {
            return params.aggregation;
        }

        if (params.aggregation === undefined) {
            if (requestMapConfig.isVectorLayergroup()) {
                return true;
            } else if (this._hasAggregation(requestMapConfig)){
                return true;
            }
        }

        return false;
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
};
