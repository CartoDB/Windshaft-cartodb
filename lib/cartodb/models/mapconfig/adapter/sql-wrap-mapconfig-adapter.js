function SqlWrapMapConfigAdapter() {
}

module.exports = SqlWrapMapConfigAdapter;


SqlWrapMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    if (requestMapConfig && Array.isArray(requestMapConfig.layers)) {
        requestMapConfig.layers = requestMapConfig.layers.map(function(layer) {
            if (layer.options) {
                var sqlQueryWrap = layer.options.sql_wrap;
                if (sqlQueryWrap) {
                    var layerSql = layer.options.sql;
                    if (layerSql) {
                        layer.options.sql_raw = layerSql;
                        layer.options.sql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, layerSql);
                    }
                }
            }
            return layer;
        });
    }

    return callback(null, requestMapConfig);
};
