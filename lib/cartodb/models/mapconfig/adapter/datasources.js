var dot = require('dot');
dot.templateSettings.strip = false;


function DatasourcesMapConfigAdapter() {
}

module.exports = DatasourcesMapConfigAdapter;


DatasourcesMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;
    this.setAnalysesResults(context.analysesResults);

    var datasourceRegistry = new DatasourceRegistry();

    var layers = requestMapConfig.layers;
    if (Array.isArray(layers)) {
        layers.forEach(function(layer) {
            if (layer.options) {
                var datasource = null;

                if (layer.options.sql) {
                    datasource = new PostgreSQLDatasource(layer.options.sql);
                }
                if (layer.options.source && layer.options.source.id) {
                    var analysisNode = self.getAnalysisNode(layer.options.source.id);
                    if (analysisNode) {
                        datasource = new AnalysisDatasource(analysisNode);
                    }
                }

                if (datasource) {
                    layer.options.source = {
                        id: datasource.id()
                    };
                    datasourceRegistry.add(datasource);
                }
            }
        });
    }

    var dataviews = requestMapConfig.dataviews;
    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = requestMapConfig.dataviews[dataviewName];
        var dataviewSourceId = dataview.source.id;
        var analysisNode = self.getAnalysisNode(dataviewSourceId);
        if (analysisNode) {
            var datasource = new AnalysisDatasource(analysisNode);
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



// ---------------------------------------------------------------------------

function DatasourceRegistry() {
    this.datasources = {};
}

DatasourceRegistry.prototype.add = function(datasource) {
    this.datasources[datasource.id()] = datasource;
};

DatasourceRegistry.prototype.get = function(id) {
    return this.datasources[id];
};



// ---------------------------------------------------------------------------

function Datasource() {
    var id = JSON.stringify(Array.apply(null, arguments));
    this.id = function() {
        return id;
    };
}

Datasource.prototype.getQuery = function() {
    throw new Error('Missing method `getQuery`');
};

Datasource.prototype.getRamp = function() {
    throw new Error('Missing method `getRamp`');
};

// Workaround for dataviews + overviews.
// This should not exist, we will be able to remove it when overviews follow this datasource pattern.
Datasource.prototype.getType = function() {
    throw new Error('Missing method `getType`');
};

Datasource.prototype.getFilters = function() {
    throw new Error('Missing method `getFilters`');
};

Datasource.prototype.getAffectedTables = function() {
    throw new Error('Missing method `getAffectedTables`');
};


// ---------------------------------------------------------------------------

function PostgreSQLDatasource(sql) {
    Datasource.apply(this, arguments);

    this.sql = sql;
}
PostgreSQLDatasource.prototype = new Datasource();
PostgreSQLDatasource.prototype.constructor = PostgreSQLDatasource;
PostgreSQLDatasource.prototype.getQuery = function(/*applyFilters*/) {
    return this.sql;
};

Datasource.prototype.getType = function() {
    // we mimic here an analysis source node
    return 'source';
};

Datasource.prototype.getFilters = function() {
    return {};
};

Datasource.prototype.getAffectedTables = function() {
    return [];
};


// ---------------------------------------------------------------------------

function AnalysisDatasource(node) {
    Datasource.apply(this);
    this.id = function() {
        return node.params.id;
    };

    this.node = node;
}
AnalysisDatasource.prototype = new Datasource();
AnalysisDatasource.prototype.constructor = AnalysisDatasource;

var SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function skipColumns(columnNames) {
    return columnNames
        .filter(function(columnName) { return !SKIP_COLUMNS[columnName]; });
}

var wrappedQueryTpl = dot.template([
    'SELECT {{=it._columns}}',
    'FROM ({{=it._query}}) _cdb_analysis_query'
].join('\n'));

function getAllAffectedTablesFromSourceNodes(node) {
    var affectedTables = node.getAllInputNodes(function (node) {
        return node.getType() === 'source';
    }).reduce(function(list, node) {
        return list.concat(node.getAffectedTables());
    },[]);
    return affectedTables;
}

AnalysisDatasource.prototype.getQuery = function(filters) {
    if (this.node.type === 'source') {
        return this.node.getQuery(filters);
    }
    var _columns = ['ST_Transform(the_geom, 3857) the_geom_webmercator'].concat(skipColumns(this.node.getColumns()));
    return wrappedQueryTpl({ _query: this.node.getQuery(filters), _columns: _columns.join(', ') });
};

AnalysisDatasource.prototype.getAffectedTables = function() {
    return getAllAffectedTablesFromSourceNodes(this.node);
};

AnalysisDatasource.prototype.getFilters = function() {
    return this.node.getFilters();
};

AnalysisDatasource.prototype.getType = function() {
    return this.node.getType();
};



// ---------------------------------------------------------------------------

function TTDatasource() {
    Datasource.apply(this);
}
TTDatasource.prototype = new Datasource();
TTDatasource.prototype.constructor = TTDatasource;
