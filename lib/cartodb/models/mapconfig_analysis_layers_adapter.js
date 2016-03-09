var queue = require('queue-async');

var camshaft = require('camshaft');
var dot = require('dot');
dot.templateSettings.strip = false;

function MapConfigAnalysisLayersAdapter(templateMaps) {
    this.templateMaps = templateMaps;
}

module.exports = MapConfigAnalysisLayersAdapter;

var SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function skipColumns(columnNames) {
    return columnNames
        .filter(function(columnName) { return !SKIP_COLUMNS[columnName]; });
}

var layerQueryTemplate = dot.template([
    'SELECT ST_Transform(the_geom, 3857) the_geom_webmercator, {{=it._columns}}',
    'FROM ({{=it._query}}) _cdb_analysis_query'
].join('\n'));

function layerQuery(query, columnNames) {
    return layerQueryTemplate({ _query: query, _columns: skipColumns(columnNames).join(', ') });
}

function shouldAdaptLayers(requestMapConfig) {
    return Array.isArray(requestMapConfig.layers) &&
        Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0;
}

MapConfigAnalysisLayersAdapter.prototype.getLayers = function(analysisConfiguration, requestMapConfig, callback) {

    if (!shouldAdaptLayers(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    function createAnalysis(analysisDefinition, done) {
        camshaft.create(analysisConfiguration, analysisDefinition, done);
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

        return callback(null, requestMapConfig);
    });
};
