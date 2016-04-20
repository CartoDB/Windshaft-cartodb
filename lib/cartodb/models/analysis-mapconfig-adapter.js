var queue = require('queue-async');
var debug = require('debug')('windshaft:analysis');

var camshaft = require('camshaft');
var dot = require('dot');
dot.templateSettings.strip = false;

function AnalysisMapConfigAdapter(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = AnalysisMapConfigAdapter;

var SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function skipColumns(columnNames) {
    return columnNames
        .filter(function(columnName) { return !SKIP_COLUMNS[columnName]; });
}

var layerQueryTemplate = dot.template([
    'SELECT {{=it._columns}}',
    'FROM ({{=it._query}}) _cdb_analysis_query'
].join('\n'));

function layerQuery(query, columnNames) {
    var _columns = ['ST_Transform(the_geom, 3857) the_geom_webmercator'].concat(skipColumns(columnNames));
    return layerQueryTemplate({ _query: query, _columns: _columns.join(', ') });
}

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

function shouldAdaptLayers(requestMapConfig) {
    return Array.isArray(requestMapConfig.layers) &&
        Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0;
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

AnalysisMapConfigAdapter.prototype.getLayers = function(analysisConfiguration, requestMapConfig, filters, callback) {
    // jshint maxcomplexity:7
    var self = this;
    filters = filters || {};

    if (!shouldAdaptLayers(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    var dataviewsFilters = filters.dataviews || {};
    debug(dataviewsFilters);
    var dataviews = requestMapConfig.dataviews || {};

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

    debug('mapconfig input', JSON.stringify(requestMapConfig, null, 4));

    requestMapConfig = appendFiltersToNodes(requestMapConfig, dataviewsFiltersBySourceId);

    function createAnalysis(analysisDefinition, done) {
        self.analysisBackend.create(analysisConfiguration, analysisDefinition, done);
    }

    var analysesQueue = queue(requestMapConfig.analyses.length);
    requestMapConfig.analyses.forEach(function(analysis) {
        analysesQueue.defer(createAnalysis, analysis);
    });

    analysesQueue.awaitAll(function(err, analysesResults) {
        if (err) {
            return callback(err);
        }

        var sourceId2Node = analysesResults.reduce(function(sourceId2Query, analysis) {
            var rootNode = analysis.getRoot();
            if (rootNode.params && rootNode.params.id) {
                sourceId2Query[rootNode.params.id] = rootNode;
            }

            analysis.getSortedNodes().forEach(function(node) {
                if (node.params && node.params.id) {
                    sourceId2Query[node.params.id] = node;
                }
            });

            return sourceId2Query;
        }, {});

        requestMapConfig.layers = requestMapConfig.layers.map(function(layer) {
            if (layer.options.source && layer.options.source.id) {
                var layerNode = sourceId2Node[layer.options.source.id];
                layer.options.sql = layerQuery(layerNode.getQuery(), layerNode.getColumns());
            }
            return layer;
        });

        debug('mapconfig output', JSON.stringify(requestMapConfig, null, 4));

        return callback(null, requestMapConfig, analysesResults);
    });
};
