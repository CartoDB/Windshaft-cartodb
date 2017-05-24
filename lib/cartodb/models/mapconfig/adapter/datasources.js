var DatasourceRegistry = require('../../datasource/registry');
var ds = require('../../datasource');

function DatasourcesMapConfigAdapter() {
}

module.exports = DatasourcesMapConfigAdapter;


DatasourcesMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;
    this.setAnalysesResults(context.analysesResults);

    var datasourceRegistry = new DatasourceRegistry();

    var layers = requestMapConfig.layers;
    var dataviews = requestMapConfig.dataviews;
    var filters = context.filters;

    if (Array.isArray(layers)) {
        layers.forEach(function(layer) {
            var datasource = null;

            if (layer.options.sql) {
                datasource = new ds.PostgreSQL(layer.options.sql);
            }
            if (layer.options.source && layer.options.source.id) {
                var analysisNode = self.getAnalysisNode(layer.options.source.id);
                if (analysisNode) {
                    datasource = new ds.Analysis(analysisNode);
                }
            }

            if (datasource) {
                if (ds.TT.shouldAdapt(datasource.getQuery(false))) {
                    datasource = new ds.TT(datasource, dataviews, filters);
                }
                layer.options.source = {
                    id: datasource.id()
                };
                datasourceRegistry.add(datasource);
            }
        });
    }

    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = requestMapConfig.dataviews[dataviewName];
        var dataviewSourceId = dataview.source.id;
        var analysisNode = self.getAnalysisNode(dataviewSourceId);
        if (analysisNode) {
            var datasource = new ds.Analysis(analysisNode);
            if (ds.TT.shouldAdapt(datasource.getQuery(false))) {
                datasource = new ds.TT(datasource, dataviews, filters);
            }
            datasourceRegistry.add(datasource);
        }
    });

    context.datasourceRegistry = datasourceRegistry;

    return callback(null, requestMapConfig);
};

// ---------------------------------------------------------------------------

DatasourcesMapConfigAdapter.prototype.setAnalysesResults = function(analysesResults) {
    this.analysesResults = analysesResults;
    this.sourceId2Node = analysesResults.reduce(function(sourceId2Query, analysis) {
        var rootNode = analysis.getRoot();
        if (rootNode.params && rootNode.params.id) {
            sourceId2Query[rootNode.params.id] = rootNode;
        }

        analysis.getNodes().forEach(function(node) {
            if (node.params && node.params.id) {
                sourceId2Query[node.params.id] = node;
            }
        });

        return sourceId2Query;
    }, {});
};

DatasourcesMapConfigAdapter.prototype.getAnalysisNode = function(layerSourceId) {
    return this.sourceId2Node[layerSourceId];
};
