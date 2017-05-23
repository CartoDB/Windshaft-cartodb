var debug = require('debug')('windshaft:datasources');
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
    var dataviews = requestMapConfig.dataviews;
    var filters = context.filters;

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
                    if (TTDatasource.shouldAdapt(datasource.getQuery(false))) {
                        datasource = new TTDatasource(datasource, dataviews, filters);
                    }
                    layer.options.source = {
                        id: datasource.id()
                    };
                    datasourceRegistry.add(datasource);
                }
            }
        });
    }

    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = requestMapConfig.dataviews[dataviewName];
        var dataviewSourceId = dataview.source.id;
        var analysisNode = self.getAnalysisNode(dataviewSourceId);
        if (analysisNode) {
            var datasource = new AnalysisDatasource(analysisNode);
            if (TTDatasource.shouldAdapt(datasource.getQuery(false))) {
                datasource = new TTDatasource(datasource, dataviews, filters);
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

Datasource.prototype.getMetadata = function() {
    throw new Error('Missing method `getMetadata`');
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

PostgreSQLDatasource.prototype.getType = function() {
    // we mimic here an analysis source node
    return 'source';
};

PostgreSQLDatasource.prototype.getFilters = function() {
    return {};
};

PostgreSQLDatasource.prototype.getAffectedTables = function() {
    return [];
};

PostgreSQLDatasource.prototype.getMetadata = function() {
    return {};
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

AnalysisDatasource.prototype.getMetadata = function() {
    return {};
};



// ---------------------------------------------------------------------------

var queryTemplate = dot.template([
    'SELECT * FROM TT_TileData(',
    '  \'{{=it.table}}\',',
    '  \'@bbox\'::json,',
    '  ARRAY[{{=it.filters}}]::json[],',
    '  ARRAY[{{=it.aggregations}}]::json[],',
    '  @zoom',
    ') AS tiledata (',
    '  cartodb_id int,',
    '  the_geom_webmercator geometry{{? it.aggregationsColumns.length > 0 }},{{?}}',
    '  {{=it.aggregationsColumns}}',
    ')'
].join('\n'));

// Example of the query we want to generate:
// SELECT * FROM TT_TileData(
//   'tttable',
//   '{"minx": -20037508.3, "minx": 20037508.29613578, "maxx": -20037508.29613578, "maxy": 20037508.3,3857 }',
//   ARRAY['{"type":"category", "column":"value3", "accept":["xx"]}']::json[],
//   ARRAY['{"aggregate_function":"sum", "aggregate_column":"value1", "type":"numeric"}',
//         '{"aggregate_function":"avg", "aggregate_column":"value2", "type":"numeric"}' ]::json[],
//   10 -- zoom
// ) AS tiledata(
//   cartodb_id int,
//   the_geom_webmercator geometry,
//   value1 numeric,
//   value2 numeric
// );

function TTDatasource(datasource, dataviews, requestFilters) {
    Datasource.apply(this);
    this.id = function() {
        return datasource.id();
    };
    this.datasource = datasource;
    this.dataviews = dataviews;
    this.sourceId = datasource.id();
    this.requestFilters = requestFilters;

    this.metadata = null;
}
TTDatasource.prototype = new Datasource();
TTDatasource.prototype.constructor = TTDatasource;

var TT_NAME_REGEX = /(tt_.*)$/i;
TTDatasource.shouldAdapt = function(query) {
    var matches = query && query.match(TT_NAME_REGEX);
    return !!matches;
};

TTDatasource.prototype.getTTName = function() {
    var query = this.datasource.getQuery(false);
    var matches = query && query.match(TT_NAME_REGEX);
    return matches && matches[0];
};

var DATAVIEW_TYPE_2_FILTER_TYPE = {
    aggregation: 'category',
    histogram: 'range'
};

function pgJson(obj) {
    return '\'' + JSON.stringify(obj) + '\'';
}


TTDatasource.prototype.getQuery = function(filters) {
    var metadata = this.getMetadata();
    if (!metadata.hasOwnProperty('table')) {
        return this.datasource.getQuery(filters);
    }
    return queryTemplate({
        table: metadata.table,
        filters: metadata.filters.map(pgJson).join(','),
        aggregations: metadata.aggregations.map(pgJson).join(','),
        aggregationsColumns: metadata.aggregations.map(function(agg) {
            var columnName = agg.aggregate_function === 'count' ?
                'count_vals' : (agg.aggregate_function + agg.aggregate_column);
            return  columnName + ' numeric';
        })
    });
};

TTDatasource.prototype.getAffectedTables = function() {
    return [];
};

TTDatasource.prototype.getFilters = function() {
    return {};
};

TTDatasource.prototype.getType = function() {
    return 'tt';
};

TTDatasource.prototype.getMetadata = function() {
    if (this.metadata !== null) {
        return this.metadata;
    }

    var self = this;

    var ttName = this.getTTName();
    var metadata = {};

    if (ttName) {
        debug('n', ttName);
        debug('s', this.sourceId);
        debug('d', this.dataviews);
        debug('f', this.requestFilters);

        var relatedDataviewKeys = Object.keys(this.dataviews).filter(function(dataviewKey) {
            return self.dataviews[dataviewKey].source.id === self.sourceId;
        });
        var filters = relatedDataviewKeys.reduce(function(filters, relatedDataviewKey) {
            if (self.requestFilters.dataviews.hasOwnProperty(relatedDataviewKey)) {
                var dataview = self.dataviews[relatedDataviewKey];
                var filter = self.requestFilters.dataviews[relatedDataviewKey];
                var relatedFilter = JSON.parse(JSON.stringify(filter));
                relatedFilter.type = DATAVIEW_TYPE_2_FILTER_TYPE[dataview.type];
                relatedFilter.column = dataview.options.column;
                filters.push(relatedFilter);
            }
            return filters;
        }, []);

        metadata = {
            table: ttName,
            filters: filters,
            aggregations: [
                // let's return the basic aggregation
                {
                    aggregate_function: 'count',
                    aggregate_column: 'cartodb_id',
                    type: 'numeric'
                }
            ]
        };
    }

    this.metadata = metadata;

    return metadata;
};

module.exports.datasource = {
    TTDatasource: TTDatasource
};
