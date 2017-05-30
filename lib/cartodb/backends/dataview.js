var assert = require('assert');

var dot = require('dot');
dot.templateSettings.strip = false;

var _ = require('underscore');
var PSQL = require('cartodb-psql');
var step = require('step');

var BBoxFilter = require('../models/filter/bbox');
var SphericalMercator = require('sphericalmercator');

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
            var sourceId =  dataviewDefinition.source.id; // node.id
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

            var bboxFilter = null;
            if (params.bbox) {
                bboxFilter = new BBoxFilter({column: 'the_geom_webmercator', srid: 3857}, {bbox: params.bbox});
                query = bboxFilter.sql(query);
                if ( queryRewriteData ) {
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
            }

            var dataviewFactory = DataviewFactoryWithOverviews.getFactory(
                overviewsQueryRewriter, queryRewriteData, { bbox: params.bbox }
            );

            var overrideParams = _.reduce(_.pick(params, 'start', 'end', 'bins'),
                function castNumbers(overrides, val, k) {
                    if (!Number.isFinite(+val)) {
                        throw new Error('Invalid number format for parameter \'' + k + '\'');
                    }
                    overrides[k] = +val;
                    return overrides;
                },
                {ownFilter: ownFilter}
            );

            var dataview = dataviewFactory.getDataview(query, dataviewDefinition);

            function pgJson(obj) {
                return '\'' + JSON.stringify(obj) + '\'';
            }
             var queryTemplate = dot.template([
                'SELECT * FROM TT_Histogram(',
                '  \'{{=it.table}}\',',
                '  {{? it.bbox !== null }}\'[{{=it.bbox}}]\'{{??}}NULL{{?}}::json,',
                '  ARRAY[{{=it.filters}}]::json[],',
                '  \'{{=it.parameters}}\'::json,',
                '  0',
                ')'
            ].join('\n'));

            function dataviewNameFilter(filter) {
                return (ownFilter) ? true : filter.dataview !== dataviewName;
            }

            if (isTTHistogram(layer, dataview)) {
                var mercator = new SphericalMercator({ size: 256 });
                var ttMetadata = layer.options.meta;
                var bbox = (bboxFilter === null) ? null :
                    mercator.convert(bboxFilter.bboxes[0], '900913').join(',');
                var histogramQuery = queryTemplate({
                    table: ttMetadata.table,
                    bbox: bbox,
                    filters: ttMetadata.filters.filter(dataviewNameFilter).map(pgJson).join(','),
                    parameters: JSON.stringify({
                        column: dataview.column,
                        bins: overrideParams.bins,
                        start: overrideParams.start,
                        end: overrideParams.end
                    })
                });

                return pg.query(histogramQuery, function(err, resultSet) {
                    if (err) {
                        return callback(err);
                    }
                    return callback(err, resultSet.rows[0].tt_histogram);
                });
            }

            dataview.getResult(pg, overrideParams, this);
        },
        function returnCallback(err, result) {
            return callback(err, result);
        }
    );
};

function isTTHistogram(layer, dataview) {
    return layer && layer.options.meta && layer.options.meta.type === 'tt' && dataview.getType() === 'histogram';
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
