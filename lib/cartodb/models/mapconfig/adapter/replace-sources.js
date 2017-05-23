var dot = require('dot');
dot.templateSettings.strip = false;

function ReplaceSourcesMapConfigAdapter() {
}

module.exports = ReplaceSourcesMapConfigAdapter;

ReplaceSourcesMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    if (!shouldAdaptLayers(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    var datasourceRegistry = context.datasourceRegistry;
    var dataviews = requestMapConfig.dataviews;

    var missingNodesErrors = [];

    requestMapConfig.layers = requestMapConfig.layers.map(function(layer, layerIndex) {
        var layerSourceId = getLayerSourceId(layer);
        if (layerSourceId) {
            var datasource = datasourceRegistry.get(layerSourceId);
            if (datasource) {
                var analysisSql = datasource.getQuery();
                var sqlQueryWrap = layer.options.sql_wrap;
                if (sqlQueryWrap) {
                    layer.options.sql_raw = analysisSql;
                    analysisSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, analysisSql);
                }
                layer.options.sql_no_filters = datasource.getQuery(false);
                layer.options.sql = analysisSql;
                layer.options.columns = getDataviewsColumns(getLayerDataviews(layer, dataviews));
                layer.options.affected_tables = datasource.getAffectedTables();
            } else {
                missingNodesErrors.push(
                    new Error('Missing analysis node.id="' + layerSourceId +'" for layer='+layerIndex)
                );
            }
        }
        return layer;
    });

    var missingDataviewsNodesErrors = getMissingDataviewsSourceIds(dataviews, datasourceRegistry);
    if (missingNodesErrors.length > 0 || missingDataviewsNodesErrors.length > 0) {
        return callback(missingNodesErrors.concat(missingDataviewsNodesErrors));
    }

    // Augment dataviews with sql from analyses
    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = requestMapConfig.dataviews[dataviewName];
        var dataviewSourceId = dataview.source.id;

        var datasource = datasourceRegistry.get(dataviewSourceId);

        // var dataviewNode = sourceId2Node[dataviewSourceId];
        dataview.node = {
            type: datasource.getType(),
            filters: datasource.getFilters()
        };

        var ownFilterOff = {};
        ownFilterOff[dataviewName] = false;
        dataview.sql = {
            own_filter_on: datasource.getQuery(),
            own_filter_off: datasource.getQuery(ownFilterOff),
            no_filters: datasource.getQuery(false)
        };
    });
    if (Object.keys(dataviews).length > 0) {
        requestMapConfig.dataviews = dataviews;
    }

    return callback(null, requestMapConfig);
};

function shouldAdaptLayers(requestMapConfig) {
    return Array.isArray(requestMapConfig.layers) && requestMapConfig.layers.some(getLayerSourceId) ||
        (Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0) ||
        Object.keys(requestMapConfig.dataviews).length > 0;
}

function getLayerSourceId(layer) {
    return layer.options.source && layer.options.source.id;
}

function getDataviewSourceId(dataview) {
    return dataview.source && dataview.source.id;
}

function getLayerDataviews(layer, dataviews) {
    var layerDataviews = [];

    var layerSourceId = getLayerSourceId(layer);
    if (layerSourceId) {
        var dataviewsList = getDataviewsList(dataviews);
        dataviewsList.forEach(function(dataview) {
            if (getDataviewSourceId(dataview) === layerSourceId) {
                layerDataviews.push(dataview);
            }
        });
    }

    return layerDataviews;
}

function getDataviewsColumns(dataviews) {
    return Object.keys(dataviews.reduce(function(columnsDict, dataview) {
        getDataviewColumns(dataview).forEach(function(columnName) {
            if (!!columnName) {
                columnsDict[columnName] = true;
            }
        });
        return columnsDict;
    }, {}));
}

function getDataviewColumns(dataview) {
    var columns = [];
    var options = dataview.options;
    ['column', 'aggregationColumn'].forEach(function(opt) {
        if (options.hasOwnProperty(opt) && !!options[opt]) {
            columns.push(options[opt]);
        }
    });
    return columns;
}

function getDataviewsList(dataviews) {
    return Object.keys(dataviews).map(function(dataviewKey) { return dataviews[dataviewKey]; });
}

function getMissingDataviewsSourceIds(dataviews, datasourceRegistry) {
    var missingDataviewsSourceIds = [];
    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = dataviews[dataviewName];
        var dataviewSourceId = getDataviewSourceId(dataview);
        var datasource = datasourceRegistry.get(dataviewSourceId);
        if (!datasource) {
            missingDataviewsSourceIds.push(new AnalysisError('Node with `source.id="' + dataviewSourceId +'"`' +
                ' not found in analyses for dataview "' + dataviewName + '"'));
        }
    });

    return missingDataviewsSourceIds;
}

function AnalysisError(message) {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.type = 'analysis';
    this.message = message;
}

require('util').inherits(AnalysisError, Error);
