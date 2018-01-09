var queue = require('queue-async');
var debug = require('debug')('windshaft:analysis');

var camshaft = require('camshaft');
var dot = require('dot');
dot.templateSettings.strip = false;

function AnalysisMapConfigAdapter(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = AnalysisMapConfigAdapter;

AnalysisMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    // jshint maxcomplexity:7
    var self = this;

    if (!shouldAdaptLayers(requestMapConfig)) {
        return callback(null, requestMapConfig);
    }

    var analysisConfiguration = context.analysisConfiguration;

    var filters = {};
    if (params.filters) {
        try {
            filters = JSON.parse(params.filters);
        } catch (e) {
            // ignore
        }
    }

    var dataviewsFilters = filters.dataviews || {};
    debug(dataviewsFilters);
    var dataviews = requestMapConfig.dataviews || {};

    var errors = getDataviewsErrors(dataviews);
    if (errors.length > 0) {
        return callback(errors);
    }

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

    // Expected format for analyses filters
    // filters = {analyses: {
    //     a1: [{min, max}, {accept, reject}],
    //     b1: [{range, column, min, max}, {category, column, accept, reject}]
    // }}
    requestMapConfig = appendFiltersToNodes(requestMapConfig, filters.analyses);

    function createAnalysis(analysisDefinition, done) {
        self.analysisBackend.create(analysisConfiguration, analysisDefinition, function (err, analysis) {
            if (err) {
                var error = new Error(err.message);
                error.type = 'analysis';
                error.analysis = {
                    id: analysisDefinition.id,
                    node_id: err.node_id,
                    type: analysisDefinition.type
                };
                return done(error);
            }

            done(null, analysis);
        });
    }

    var analysesQueue = queue(1);
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

            analysis.getNodes().forEach(function(node) {
                if (node.params && node.params.id) {
                    sourceId2Query[node.params.id] = node;
                }
            });

            return sourceId2Query;
        }, {});

        var missingNodesErrors = [];

        requestMapConfig.layers = requestMapConfig.layers.map(function(layer, layerIndex) {
            if (getLayerSourceId(layer)) {
                var layerSourceId = getLayerSourceId(layer);
                var layerNode = sourceId2Node[layerSourceId];
                if (layerNode) {
                    var analysisSql = layerQuery(layerNode);
                    var sqlQueryWrap = layer.options.sql_wrap;
                    if (sqlQueryWrap) {
                        layer.options.sql_raw = analysisSql;
                        analysisSql = sqlQueryWrap.replace(/<%=\s*sql\s*%>/g, analysisSql);
                    }
                    layer.options.sql = analysisSql;
                    layer.options.columns = getDataviewsColumns(getLayerDataviews(layer, dataviews));
                    layer.options.affected_tables = getAllAffectedTablesFromSourceNodes(layerNode);
                } else {
                    missingNodesErrors.push(
                        new Error('Missing analysis node.id="' + layerSourceId +'" for layer='+layerIndex)
                    );
                }
            }
            return layer;
        });

        var missingDataviewsNodesErrors = getMissingDataviewsSourceIds(dataviews, sourceId2Node);
        if (missingNodesErrors.length > 0 || missingDataviewsNodesErrors.length > 0) {
            return callback(missingNodesErrors.concat(missingDataviewsNodesErrors));
        }

        // Augment dataviews with sql from analyses
        Object.keys(dataviews).forEach(function(dataviewName) {
            var dataview = requestMapConfig.dataviews[dataviewName];
            var dataviewSourceId = dataview.source.id;
            var dataviewNode = sourceId2Node[dataviewSourceId];
            dataview.node = {
                type: dataviewNode.type,
                filters: dataviewNode.getFilters()
            };
            dataview.sql = {
                own_filter_on: dataviewQuery(dataviewNode, dataviewName, true),
                own_filter_off: dataviewQuery(dataviewNode, dataviewName, false),
                no_filters: dataviewNode.getQuery(Object.keys(dataviewNode.getFilters())
                    .reduce(function(applyFilters, filterId) {
                        applyFilters[filterId] = false;
                        return applyFilters;
                    }, {})
                )
            };
        });
        if (Object.keys(dataviews).length > 0) {
            requestMapConfig.dataviews = dataviews;
        }

        debug('mapconfig output', JSON.stringify(requestMapConfig, null, 4));

        context.analysesResults = analysesResults;

        return callback(null, requestMapConfig);
    });
};

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

function layerQuery(node) {
    if (node.type === 'source') {
        return node.getQuery();
    }
    var _columns = ['ST_Transform(the_geom, 3857) the_geom_webmercator'].concat(skipColumns(node.getColumns()));
    return wrappedQueryTpl({ _query: node.getQuery(), _columns: _columns.join(', ') });
}

function dataviewQuery(node, dataviewName, ownFilter) {
    var applyFilters = {};
    if (!ownFilter) {
        applyFilters[dataviewName] = false;
    }

    if (node.type === 'source') {
        return node.getQuery(applyFilters);
    }
    var _columns = ['ST_Transform(the_geom, 3857) the_geom_webmercator'].concat(skipColumns(node.getColumns()));
    return wrappedQueryTpl({ _query: node.getQuery(applyFilters), _columns: _columns.join(', ') });
}

function appendFiltersToNodes(requestMapConfig, dataviewsFiltersBySourceId) {
    var analyses = requestMapConfig.analyses || [];
    dataviewsFiltersBySourceId = dataviewsFiltersBySourceId || {};

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
    return Array.isArray(requestMapConfig.layers) && requestMapConfig.layers.some(getLayerSourceId) ||
        (Array.isArray(requestMapConfig.analyses) && requestMapConfig.analyses.length > 0) ||
        requestMapConfig.dataviews;
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

function getDataviewsErrors(dataviews) {
    var dataviewType = typeof dataviews;
    if (dataviewType !== 'object') {
        return [new Error('"dataviews" must be a valid JSON object: "' + dataviewType + '" type found')];
    }

    if (Array.isArray(dataviews)) {
        return [new Error('"dataviews" must be a valid JSON object: "array" type found')];
    }

    var errors = [];

    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = dataviews[dataviewName];
        if (!dataview.hasOwnProperty('source') || !dataview.source.id) {
            errors.push(new Error('Dataview "' + dataviewName + '" is missing `source.id` attribute'));
        }

        if (!dataview.type) {
            errors.push(new Error('Dataview "' + dataviewName + '" is missing `type` attribute'));
        }
    });

    return errors;
}

function getMissingDataviewsSourceIds(dataviews, sourceId2Node) {
    var missingDataviewsSourceIds = [];
    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = dataviews[dataviewName];
        var dataviewSourceId = getDataviewSourceId(dataview);
        if (!sourceId2Node.hasOwnProperty(dataviewSourceId)) {
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

function getAllAffectedTablesFromSourceNodes(node) {
    var affectedTables = node.getAllInputNodes(function (node) {
        return node.getType() === 'source';
    }).reduce(function(list, node) {
        return list.concat(node.getAffectedTables());
    },[]);
    return affectedTables;
}

require('util').inherits(AnalysisError, Error);
