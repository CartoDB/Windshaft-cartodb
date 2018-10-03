var _ = require('underscore');
var PSQL = require('cartodb-psql');
var BBoxFilter = require('../models/filter/bbox');
var DataviewFactory = require('../models/dataview/factory');
const dbParamsFromReqParams = require('../utils/database-params');

var dot = require('dot');
dot.templateSettings.strip = false;

function DataviewBackend(analysisBackend) {
    this.analysisBackend = analysisBackend;
}

module.exports = DataviewBackend;

DataviewBackend.prototype.getDataview = function (mapConfigProvider, user, params, callback) {
    const dataviewName = params.dataviewName;

    mapConfigProvider.getMapConfig(function (err, mapConfig) {
        if (err) {
            return callback(err);
        }

        var dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
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

        var pg;
        var overrideParams;
        var dataview;

        try {
            pg = new PSQL(dbParamsFromReqParams(params));
            var query = getQueryWithFilters(dataviewDefinition, params);
            dataview = DataviewFactory.getDataview(query, dataviewDefinition);
            var ownFilter = +params.own_filter;
            overrideParams = getOverrideParams(params, !!ownFilter);
        } catch (error) {
            return callback(error);
        }

        dataview.getResult(pg, overrideParams, function (err, dataviewResult) {
            if (err) {
                return callback(err);
            }

            return callback(null, dataviewResult);
        });
    });
};

function validFilterParams (params) {
    var ownFilter = +params.own_filter;
    var noFilters = +params.no_filters;

    return !(Number.isFinite(ownFilter) && Number.isFinite(noFilters));
}

function getQueryWithFilters (dataviewDefinition, params) {
    var ownFilter = +params.own_filter;
    var noFilters = +params.no_filters;
    var query = getDataviewQuery(dataviewDefinition, ownFilter, noFilters);

    if (params.bbox) {
        var bboxFilter = new BBoxFilter({column: 'the_geom_webmercator', srid: 3857}, {bbox: params.bbox});
        query = bboxFilter.sql(query);
    }

    return query;
}

function getDataviewQuery(dataviewDefinition, ownFilter, noFilters) {
    if (noFilters) {
        return dataviewDefinition.sql.no_filters;
    } else if (ownFilter === 1) {
        return dataviewDefinition.sql.own_filter_on;
    } else {
        return dataviewDefinition.sql.own_filter_off;
    }
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
    mapConfigProvider.getMapConfig(function (err, mapConfig) {
        if (err) {
            return callback(err);
        }

        var dataviewDefinition = getDataviewDefinition(mapConfig.obj(), dataviewName);
        if (!dataviewDefinition) {
            const error = new Error(`Dataview '${dataviewName}' does not exist`);
            error.type = 'dataview';
            error.http_status = 400;
            return callback(error);
        }

        var pg;
        var query;
        var dataview;
        var userQuery = params.q;

        try {
            pg = new PSQL(dbParamsFromReqParams(params));
            query = getQueryWithOwnFilters(dataviewDefinition, params);
            dataview = DataviewFactory.getDataview(query, dataviewDefinition);
        } catch (error) {
            return callback(error);
        }

        dataview.search(pg, userQuery, function (err, result) {
            if (err) {
                return callback(err);
            }

            return callback(null, result);
        });
    });
};

function getQueryWithOwnFilters (dataviewDefinition, params) {
    var ownFilter = +params.own_filter;
    ownFilter = !!ownFilter;

    var query = (ownFilter) ? dataviewDefinition.sql.own_filter_on : dataviewDefinition.sql.own_filter_off;

    if (params.bbox) {
        var bboxFilter = new BBoxFilter({ column: 'the_geom', srid: 4326 }, { bbox: params.bbox });
        query = bboxFilter.sql(query);
    }

    return query;
}

function getDataviewDefinition(mapConfig, dataviewName) {
    var dataviews = mapConfig.dataviews || {};
    return dataviews[dataviewName];
}
