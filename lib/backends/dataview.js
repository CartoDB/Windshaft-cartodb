'use strict';

const PSQL = require('cartodb-psql');
const BBoxFilter = require('../models/filter/bbox');
const CircleFilter = require('../models/filter/circle');
const PolygonFilter = require('../models/filter/polygon');
const DataviewFactory = require('../models/dataview/factory');
const DataviewFactoryWithOverviews = require('../models/dataview/overviews/factory');
const dbParamsFromReqParams = require('../utils/database-params');
const OverviewsQueryRewriter = require('../utils/overviews-query-rewriter');
const overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'cartodb.CDB_ZoomFromScale(!scale_denominator!)'
});

module.exports = class DataviewBackend {
    constructor (analysisBackend) {
        this.analysisBackend = analysisBackend;
    }

    getDataview (mapConfigProvider, user, params, callback) {
        const dataviewName = params.dataviewName;

        mapConfigProvider.getMapConfig((err, mapConfig) => {
            if (err) {
                return callback(err);
            }

            const dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!dataviewDefinition) {
                const error = new Error(`Dataview '${dataviewName}' does not exist`);
                error.type = 'dataview';
                error.http_status = 400;
                return callback(error);
            }

            if (!validFilterParams(params)) {
                const error = new Error('Both own_filter and no_filters cannot be sent in the same request');
                error.type = 'dataview';
                error.http_status = 400;
                return callback(error);
            }

            let pg;
            let overrideParams;
            let dataview;

            try {
                pg = new PSQL(dbParamsFromReqParams(params));
                const query = getQueryWithFilters(dataviewDefinition, params);
                const queryRewriteData = getQueryRewriteData(mapConfig, dataviewDefinition, params);
                const dataviewFactory = DataviewFactoryWithOverviews.getFactory(overviewsQueryRewriter, queryRewriteData, {
                    bbox: params.bbox
                });
                dataview = dataviewFactory.getDataview(query, dataviewDefinition);
                const ownFilter = +params.own_filter;
                overrideParams = getOverrideParams(params, !!ownFilter);
            } catch (error) {
                return callback(error);
            }

            dataview.getResult(pg, overrideParams, (err, dataviewResult, stats = {}) => {
                if (err) {
                    return callback(err);
                }

                return callback(null, dataviewResult, stats);
            });
        });
    }

    search (mapConfigProvider, user, dataviewName, params, callback) {
        mapConfigProvider.getMapConfig((err, mapConfig) => {
            if (err) {
                return callback(err);
            }

            const dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
            if (!dataviewDefinition) {
                const error = new Error(`Dataview '${dataviewName}' does not exist`);
                error.type = 'dataview';
                error.http_status = 400;
                return callback(error);
            }

            let pg;
            let query;
            let dataview;
            const userQuery = params.q;

            try {
                pg = new PSQL(dbParamsFromReqParams(params));
                query = getQueryWithOwnFilters(dataviewDefinition, params);
                dataview = DataviewFactory.getDataview(query, dataviewDefinition);
            } catch (error) {
                return callback(error);
            }

            dataview.search(pg, userQuery, (err, result) => {
                if (err) {
                    return callback(err);
                }

                return callback(null, result);
            });
        });
    }
};

function validFilterParams (params) {
    const ownFilter = +params.own_filter;
    const noFilters = +params.no_filters;

    return !(Number.isFinite(ownFilter) && Number.isFinite(noFilters));
}

function getQueryWithFilters (dataviewDefinition, params) {
    const ownFilter = +params.own_filter;
    const noFilters = +params.no_filters;
    let query = getDataviewQuery(dataviewDefinition, ownFilter, noFilters);

    if (params.bbox) {
        const bboxFilter = new BBoxFilter({ column: 'the_geom_webmercator', srid: 3857 }, { bbox: params.bbox });
        query = bboxFilter.sql(query);
    } else if (params.circle) {
        const circleFilter = new CircleFilter({ column: 'the_geom_webmercator', srid: 3857 }, { circle: params.circle });
        query = circleFilter.sql(query);
    } else if (params.polygon) {
        const polygonFilter = new PolygonFilter({ column: 'the_geom_webmercator', srid: 3857 }, { polygon: params.polygon });
        query = polygonFilter.sql(query);
    }

    return query;
}

function getDataviewQuery (dataviewDefinition, ownFilter, noFilters) {
    if (noFilters) {
        return dataviewDefinition.sql.no_filters;
    } else if (ownFilter === 1) {
        return dataviewDefinition.sql.own_filter_on;
    } else {
        return dataviewDefinition.sql.own_filter_off;
    }
}

function getQueryRewriteData (mapConfig, dataviewDefinition, params) {
    const sourceId = dataviewDefinition.source.id; // node.id
    const layer = mapConfig.obj().layers.find((l) => l.options.source && (l.options.source.id === sourceId));
    let queryRewriteData = layer && layer.options.query_rewrite_data;

    if (queryRewriteData && dataviewDefinition.node.type === 'source') {
        queryRewriteData = Object.assign({}, queryRewriteData, {
            filters: dataviewDefinition.node.filters,
            unfiltered_query: dataviewDefinition.sql.own_filter_on
        });
    }

    if (params.bbox && queryRewriteData) {
        const bboxFilterDefinition = {
            type: 'bbox',
            options: {
                column: 'the_geom_webmercator',
                srid: 3857
            },
            params: {
                bbox: params.bbox
            }
        };
        queryRewriteData = Object.assign(queryRewriteData, { bbox_filter: bboxFilterDefinition });
    }

    return queryRewriteData;
}

function getOverrideParams (params, ownFilter) {
    const dataviewParams = Object.keys(params)
        .filter((key) => ['start', 'end', 'bins', 'offset', 'categories'].includes(key))
        .reduce((dataviewParams, key) => Object.assign(dataviewParams, { [key]: params[key] }), {});

    const overrideParams = Object.entries(dataviewParams)
        .reduce((overrideParams, [key, value]) => {
            if (!Number.isFinite(+value)) {
                throw new Error(`Invalid number format for parameter '${key}'`);
            }
            overrideParams[key] = +value;
            return overrideParams;
        }, { ownFilter: ownFilter });

    // validation will be delegated to the proper dataview
    if (params.aggregation !== undefined) {
        overrideParams.aggregation = params.aggregation;
    }

    return overrideParams;
}

function getQueryWithOwnFilters (dataviewDefinition, params) {
    let ownFilter = +params.own_filter;
    ownFilter = !!ownFilter;

    let query = (ownFilter) ? dataviewDefinition.sql.own_filter_on : dataviewDefinition.sql.own_filter_off;

    if (params.bbox) {
        const bboxFilter = new BBoxFilter({ column: 'the_geom', srid: 4326 }, { bbox: params.bbox });
        query = bboxFilter.sql(query);
    } else if (params.circle) {
        const circleFilter = new CircleFilter({ column: 'the_geom', srid: 4326 }, { circle: params.circle });
        query = circleFilter.sql(query);
    } else if (params.polygon) {
        const polygonFilter = new PolygonFilter({ column: 'the_geom', srid: 4326 }, { polygon: params.polygon });
        query = polygonFilter.sql(query);
    }

    return query;
}

function getDataviewDefinition (mapConfig, dataviewName) {
    const dataviews = mapConfig.dataviews || {};
    return dataviews[dataviewName];
}
