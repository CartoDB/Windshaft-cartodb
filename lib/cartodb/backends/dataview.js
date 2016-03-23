var assert = require('assert');

var _ = require('underscore');
var PSQL = require('cartodb-psql');
var camshaft = require('camshaft');
var step = require('step');

var Timer = require('../stats/timer');

var BBoxFilter = require('../models/filter/bbox');
var DataviewFactory = require('../models/dataview/factory');

function DataviewBackend() {
}

module.exports = DataviewBackend;


DataviewBackend.prototype.getDataview = function (mapConfigProvider, user, params, callback) {
    var timer = new Timer();

    var dataviewName = params.dataviewName;

    var mapConfig;
    var dataviewDefinition;
    step(
        function getMapConfig() {
            mapConfigProvider.getMapConfig(this);
        },
        function _getDataviewDefinition(err, _mapConfig) {
            assert.ifError(err);

            mapConfig = _mapConfig;

            var _dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!_dataviewDefinition) {
                throw new Error("Dataview '" + dataviewName + "' does not exists");
            }

            dataviewDefinition = _dataviewDefinition;

            return dataviewDefinition;
        },
        function loadAnalysis(err) {
            assert.ifError(err);

            var analysisConfiguration = {
                db: {
                    host: params.dbhost,
                    port: params.dbport,
                    dbname: params.dbname,
                    user: params.dbuser,
                    pass: params.dbpassword
                },
                batch: {
                    // TODO load this from configuration
                    endpoint: 'http://127.0.0.1:8080/api/v1/sql/job',
                    username: user,
                    apiKey: params.api_key
                }
            };

            var sourceId = dataviewDefinition.source.id;
            var analysisDefinition = getAnalysisDefinition(mapConfig.obj().analyses, sourceId);

            var next = this;

            camshaft.create(analysisConfiguration, analysisDefinition, function(err, analysis) {
                if (err) {
                    return next(err);
                }

                var sourceId2Node = {};
                var rootNode = analysis.getRoot();
                if (rootNode.params && rootNode.params.id) {
                    sourceId2Node[rootNode.params.id] = rootNode;
                }

                analysis.getSortedNodes().forEach(function(node) {
                    if (node.params && node.params.id) {
                        sourceId2Node[node.params.id] = node;
                    }
                });

                var node = sourceId2Node[sourceId];

                if (!node) {
                    return next(new Error('Analysis node not found for dataview'));
                }

                return next(null, node);
            });
        },
        function runDataviewQuery(err, node) {
            assert.ifError(err);

            var pg = new PSQL(dbParamsFromReqParams(params));

            var ownFilter = +params.own_filter;
            ownFilter = !!ownFilter;

            var query;
            if (ownFilter) {
                query = node.getQuery();
            } else {
                var applyFilters = {};
                applyFilters[dataviewName] = false;
                query = node.getQuery(applyFilters);
            }

            if (params.bbox) {
                var bboxFilter = new BBoxFilter({column: 'the_geom', srid: 4326}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
            }


            var overrideParams = _.reduce(_.pick(params, 'start', 'end', 'bins'),
                function castNumbers(overrides, val, k) {
                    overrides[k] = Number.isFinite(+val) ? +val : val;
                    return overrides;
                },
                {ownFilter: ownFilter}
            );

            var dataview = DataviewFactory.getDataview(query, dataviewDefinition);
            dataview.getResult(pg, overrideParams, this);
        },
        function returnCallback(err, result) {
            return callback(err, result, timer.getTimes());
        }
    );
};

DataviewBackend.prototype.search = function (mapConfigProvider, user, params, callback) {
    var timer = new Timer();

    var dataviewName = params.dataviewName;

    var mapConfig;
    var dataviewDefinition;
    step(
        function getMapConfig() {
            mapConfigProvider.getMapConfig(this);
        },
        function _getDataviewDefinition(err, _mapConfig) {
            assert.ifError(err);

            mapConfig = _mapConfig;

            var _dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!_dataviewDefinition) {
                throw new Error("Dataview '" + dataviewName + "' does not exists");
            }

            dataviewDefinition = _dataviewDefinition;

            return dataviewDefinition;
        },
        function loadAnalysis(err) {
            assert.ifError(err);

            var analysisConfiguration = {
                db: {
                    host: params.dbhost,
                    port: params.dbport,
                    dbname: params.dbname,
                    user: params.dbuser,
                    pass: params.dbpassword
                },
                batch: {
                    // TODO load this from configuration
                    endpoint: 'http://127.0.0.1:8080/api/v1/sql/job',
                    username: user,
                    apiKey: params.api_key
                }
            };

            var sourceId = dataviewDefinition.source.id;
            var analysisDefinition = getAnalysisDefinition(mapConfig.obj().analyses, sourceId);

            var next = this;

            camshaft.create(analysisConfiguration, analysisDefinition, function(err, analysis) {
                if (err) {
                    return next(err);
                }

                var sourceId2Node = {};
                var rootNode = analysis.getRoot();
                if (rootNode.params && rootNode.params.id) {
                    sourceId2Node[rootNode.params.id] = rootNode;
                }

                analysis.getSortedNodes().forEach(function(node) {
                    if (node.params && node.params.id) {
                        sourceId2Node[node.params.id] = node;
                    }
                });

                var node = sourceId2Node[sourceId];

                if (!node) {
                    return next(new Error('Analysis node not found for dataview'));
                }

                return next(null, node);
            });
        },
        function runDataviewQuery(err, node) {
            assert.ifError(err);

            var pg = new PSQL(dbParamsFromReqParams(params));

            var ownFilter = +params.own_filter;
            ownFilter = !!ownFilter;

            var query;
            if (ownFilter) {
                query = node.getQuery();
            } else {
                var applyFilters = {};
                applyFilters[dataviewName] = false;
                query = node.getQuery(applyFilters);
            }

            if (params.bbox) {
                var bboxFilter = new BBoxFilter({column: 'the_geom', srid: 4326}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
            }

            var userQuery = params.q;
            console.log(userQuery);

            var dataview = DataviewFactory.getDataview(query, dataviewDefinition);
            dataview.search(pg, userQuery, this);
        },
        function returnCallback(err, result) {
            return callback(err, result, timer.getTimes());
        }
    );
};

function getAnalysisDefinition(mapConfigAnalyses, sourceId) {
    mapConfigAnalyses = mapConfigAnalyses || [];
    for (var i = 0; i < mapConfigAnalyses.length; i++) {
        var analysisGraph = new camshaft.reference.AnalysisGraph(mapConfigAnalyses[i]);
        var nodes = analysisGraph.getNodesWithId();
        if (nodes.hasOwnProperty(sourceId)) {
            return mapConfigAnalyses[i];
        }
    }
    throw new Error('There is no associated analysis for the dataview source id');
}

function getDataviewDefinition(mapConfig, dataviewName) {
    var dataviews = mapConfig.dataviews || {};
    return dataviews[dataviewName];
}

function dbParamsFromReqParams(params) {
    var dbParams = {};
    if ( params.dbuser ) {
        dbParams.user = params.dbuser;
    }
    if ( params.dbpassword ) {
        dbParams.pass = params.dbpassword;
    }
    if ( params.dbhost ) {
        dbParams.host = params.dbhost;
    }
    if ( params.dbport ) {
        dbParams.port = params.dbport;
    }
    if ( params.dbname ) {
        dbParams.dbname = params.dbname;
    }
    return dbParams;
}