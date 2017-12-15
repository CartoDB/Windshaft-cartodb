var assert = require('assert');

var _ = require('underscore');
var PSQL = require('cartodb-psql');
var step = require('step');

var BBoxFilter = require('../models/filter/bbox');

var DataviewFactory = require('../models/dataview/factory');
var DataviewFactoryWithOverviews = require('../models/dataview/overviews/factory');
var OverviewsQueryRewriter = require('../utils/overviews_query_rewriter');
var overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'CDB_ZoomFromScale(!scale_denominator!)'
});

var dot = require('dot');
dot.templateSettings.strip = false;

function DataviewBackend(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = DataviewBackend;

DataviewBackend.prototype.getDataview = function (mapConfigProvider, user, params, callback) {

    var dataviewName = params.dataviewName;
    step(
        function getMapConfig() {
            mapConfigProvider.getMapConfig(this);
        },
        function runDataviewQuery(err, mapConfig) {
            assert.ifError(err);

            var dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!dataviewDefinition) {
                throw new Error("Dataview '" + dataviewName + "' does not exists");
            }

            var ownFilter = +params.own_filter;
            var noFilters = +params.no_filters;
            if (Number.isFinite(ownFilter) && Number.isFinite(noFilters)) {
                err = new Error();
                err.message = 'Both own_filter and no_filters cannot be sent in the same request';
                err.type = 'dataview';
                err.http_status = 400;
                return callback(err);
            }

            var pg = new PSQL(dbParamsFromReqParams(params));
            
            var query = getDataviewQuery(dataviewDefinition, ownFilter, noFilters);
            if (params.bbox) {
                var bboxFilter = new BBoxFilter({column: 'the_geom_webmercator', srid: 3857}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
            }

            var queryRewriteData = getQueryRewriteData(mapConfig, dataviewDefinition, params);

            var dataviewFactory = DataviewFactoryWithOverviews.getFactory(
                overviewsQueryRewriter, queryRewriteData, { bbox: params.bbox }
            );

            var dataview = dataviewFactory.getDataview(query, dataviewDefinition);
            dataview.getResult(pg, getOverrideParams(params, !!ownFilter), this);
        },
        function returnCallback(err, result) {
            return callback(err, result);
        }
    );
};

function getDataviewQuery(dataviewDefinition, ownFilter, noFilters) {
    if (noFilters) {
        return dataviewDefinition.sql.no_filters;
    } else if (ownFilter === 1) {
        return dataviewDefinition.sql.own_filter_on;
    } else {
        return dataviewDefinition.sql.own_filter_off;
    }
}

function getQueryRewriteData(mapConfig, dataviewDefinition, params) {
    var sourceId = dataviewDefinition.source.id; // node.id
    var layer = _.find(mapConfig.obj().layers, function(l) {
        return l.options.source && (l.options.source.id === sourceId);
    });
    var queryRewriteData = layer && layer.options.query_rewrite_data;
    if (queryRewriteData && dataviewDefinition.node.type === 'source') {
        queryRewriteData = _.extend({}, queryRewriteData, {
            filters: dataviewDefinition.node.filters,
            unfiltered_query: dataviewDefinition.sql.own_filter_on
        });
    }

    if (params.bbox && queryRewriteData) {
        var bbox_filter_definition = {
            type: 'bbox',
            options: {
                column: 'the_geom_webmercator',
                srid: 3857
            },
            params: {
                bbox: params.bbox
            }
        };
        queryRewriteData = _.extend(queryRewriteData, { bbox_filter: bbox_filter_definition });
    }

    return queryRewriteData;
}

function getOverrideParams(params, ownFilter) {
    var overrideParams = _.reduce(_.pick(params, 'start', 'end', 'bins', 'offset', 'categories'),
        function castNumbers(overrides, val, k) {
            if (!Number.isFinite(+val)) {
                throw new Error('Invalid number format for parameter \'' + k + '\'');
            }
            overrides[k] = +val;
            return overrides;
        },
        {ownFilter: ownFilter}
    );

    // validation will be delegated to the proper dataview
    if (params.aggregation !== undefined) {
        overrideParams.aggregation = params.aggregation;
    }

    return overrideParams;
}

DataviewBackend.prototype.search = function (mapConfigProvider, user, dataviewName, params, callback) {
    step(
        function getMapConfig() {
            mapConfigProvider.getMapConfig(this);
        },
        function runDataviewSearchQuery(err, mapConfig) {
            assert.ifError(err);

            var dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!dataviewDefinition) {
                throw new Error("Dataview '" + dataviewName + "' does not exists");
            }

            var pg = new PSQL(dbParamsFromReqParams(params));

            var ownFilter = +params.own_filter;
            ownFilter = !!ownFilter;

            var query = (ownFilter) ? dataviewDefinition.sql.own_filter_on : dataviewDefinition.sql.own_filter_off;

            if (params.bbox) {
                var bboxFilter = new BBoxFilter({column: 'the_geom', srid: 4326}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
            }

            var userQuery = params.q;

            var dataview = DataviewFactory.getDataview(query, dataviewDefinition);
            dataview.search(pg, userQuery, this);
        },
        function returnCallback(err, result) {
            return callback(err, result);
        }
    );
};

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
