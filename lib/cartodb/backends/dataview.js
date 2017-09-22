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

            var pg = new PSQL(dbParamsFromReqParams(params));

            var ownFilter = +params.own_filter;
            ownFilter = !!ownFilter;

            var query = (ownFilter) ? dataviewDefinition.sql.own_filter_on : dataviewDefinition.sql.own_filter_off;
            if (params.bbox) {
                var bboxFilter = new BBoxFilter({column: 'the_geom_webmercator', srid: 3857}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
            }

            var queryRewriteData = getQueryRewriteData(mapConfig, dataviewDefinition, params);

            var dataviewFactory = DataviewFactoryWithOverviews.getFactory(
                overviewsQueryRewriter, queryRewriteData, { bbox: params.bbox }
            );

            var dataview = dataviewFactory.getDataview(query, dataviewDefinition);
            dataview.getResult(pg, getOverrideParams(params, ownFilter), this);
        },
        function returnCallback(err, result) {
            return callback(err, result);
        }
    );
};

function getQueryRewriteData(mapConfig, dataviewDefinition, params) {
    var sourceId = dataviewDefinition.source.id; // node.id
    var layer = _.find(mapConfig.obj().layers, function(l) {
        return l.options.source && (l.options.source.id === sourceId);
    });
    var queryRewriteData = layer && layer.options.query_rewrite_data;
    if (queryRewriteData && dataviewDefinition.node.type === 'source') {
        queryRewriteData = _.extend({}, queryRewriteData, {
            filters: dataviewDefinition.node.filters,
            unfiltered_query: dataviewDefinition.sql.no_filters
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
    var overrideParams = _.reduce(_.pick(params, 'start', 'end', 'bins', 'offset'),
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

DataviewBackend.prototype.search = function (mapConfigProvider, user, params, callback) {
    var dataviewName = params.dataviewName;

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
