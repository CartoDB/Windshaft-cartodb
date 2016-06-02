function DataviewsWidgetsMapConfigAdapter() {
}

module.exports = DataviewsWidgetsMapConfigAdapter;


DataviewsWidgetsMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    if (!shouldAdapt(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    // prepare placeholders for new dataviews created from widgets
    requestMapConfig.analyses = requestMapConfig.analyses || [];
    requestMapConfig.dataviews = requestMapConfig.dataviews || {};

    requestMapConfig.layers.forEach(function(layer, index) {
        var layerSourceId = getLayerSourceId(layer);
        var dataviewSourceId = layerSourceId || 'cdb-layer-source-' + index;
        // Append a new analysis if layer has no source id but sql.
        if (!layerSourceId) {
            requestMapConfig.analyses.push(
                {
                    id: dataviewSourceId,
                    type: 'source',
                    params: {
                        query: layer.options.sql
                    }
                }
            );
        }
        var source = { id: dataviewSourceId };
        var layerWidgets = layer.options.widgets || {};
        Object.keys(layerWidgets).forEach(function(widgetId) {
            var dataview = layerWidgets[widgetId];
            requestMapConfig.dataviews[widgetId] = {
                source: source,
                type: dataview.type,
                options: dataview.options
            };
        });

        layer.options.source = source;

        delete layer.options.sql;
        // don't delete widgets for now as it might be useful for old clients
        //delete layer.options.widgets;
    });

    // filters have to be rewritten also
    var filters = getFilters(params);
    var layersFilters = filters.layers || [];
    filters.dataviews = filters.dataviews || {};

    layersFilters.forEach(function(layerFilters) {
        Object.keys(layerFilters).forEach(function(filterName) {
            if (!filters.dataviews.hasOwnProperty(filterName)) {
                filters.dataviews[filterName] = layerFilters[filterName];
            }
        });
    });

    delete filters.layers;

    params.filters = JSON.stringify(filters);

    return callback(null, requestMapConfig);
};

function shouldAdapt(requestMapConfig) {
    return Array.isArray(requestMapConfig.layers) && requestMapConfig.layers.some(function hasWidgets(layer) {
        return layer.options && layer.options.widgets && Object.keys(layer.options.widgets).length > 0;
    });
}

function getLayerSourceId(layer) {
    return layer.options.source && layer.options.source.id;
}

function getFilters(params) {
    var filters = {};
    if (params.filters) {
        try {
            filters = JSON.parse(params.filters);
        } catch (e) {
            // ignore
        }
    }
    return filters;
}
