var debug = require('debug')('windshaft:analysis');

var camshaft = require('camshaft');
var dot = require('dot');
dot.templateSettings.strip = false;

function DataviewsFiltersMapConfigAdapter(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = DataviewsFiltersMapConfigAdapter;

DataviewsFiltersMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    if (!shouldApplyDataviewsFilters(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    var dataviewsFilters = context.filters.dataviews;
    var dataviews = requestMapConfig.dataviews;

    var dataviewsFiltersBySourceId = Object.keys(dataviewsFilters).reduce(function(bySourceId, dataviewName) {
        var dataview = dataviews[dataviewName];
        if (dataview) {
            var sourceId = dataview.source.id;
            if (!bySourceId.hasOwnProperty(sourceId)) {
                bySourceId[sourceId] = {};
            }

            bySourceId[sourceId][dataviewName] = getFilter(dataview, dataviewsFilters[dataviewName]);
        }
        return bySourceId;
    }, {});

    debug(dataviewsFiltersBySourceId);

    requestMapConfig = appendFiltersToNodes(requestMapConfig, dataviewsFiltersBySourceId);

    return callback(null, requestMapConfig);
};

function appendFiltersToNodes(requestMapConfig, dataviewsFiltersBySourceId) {
    var analyses = requestMapConfig.analyses || [];

    requestMapConfig.analyses = analyses.map(function(analysisDefinition) {
        var analysisGraph = new camshaft.reference.AnalysisGraph(analysisDefinition);
        var definition = analysisDefinition;
        Object.keys(dataviewsFiltersBySourceId).forEach(function(sourceId) {
            definition = analysisGraph.getDefinitionWith(sourceId, {filters: dataviewsFiltersBySourceId[sourceId] });
        });

        return definition;
    });

    return requestMapConfig;
}

function shouldApplyDataviewsFilters(requestMapConfig) {
    return Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0;
}

var DATAVIEW_TYPE_2_FILTER_TYPE = {
    aggregation: 'category',
    histogram: 'range'
};
function getFilter(dataview, params) {
    var type = dataview.type;

    return {
        type: DATAVIEW_TYPE_2_FILTER_TYPE[type],
        column: dataview.options.column,
        params: params
    };
}
