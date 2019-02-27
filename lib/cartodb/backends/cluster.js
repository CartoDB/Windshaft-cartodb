'use strict';

const PSQL = require('cartodb-psql');
const dbParamsFromReqParams = require('../utils/database-params');
const debug = require('debug')('backend:cluster');
const AggregationMapConfig = require('../models/aggregation/aggregation-mapconfig');

module.exports = class ClusterBackend {
    getClusterFeatures (mapConfigProvider, params, callback) {
        mapConfigProvider.getMapConfig((err, _mapConfig) => {
            if (err) {
                return callback(err);
            }

            let pg;
            try {
                pg = new PSQL(dbParamsFromReqParams(params));
            } catch (error) {
                return callback(error);
            }

            const { user, token, layer: layerIndex } = params;
            const mapConfig = new AggregationMapConfig(user, _mapConfig.obj(), pg);

            if (!mapConfig.isAggregationLayer(layerIndex)) {
                const error = new Error(`Map ${token} has no aggregation defined for layer ${layerIndex}`);
                debug(error);
                return callback(error);
            }

            const layer = mapConfig.getLayer(layerIndex);
            const query = layer.options.sql_raw;
            const resolution = layer.options.aggregation.resolution || 1;

            getColumnsName(pg, query, (err, columns) => {
                if (err) {
                    return callback(err);
                }

                const { zoom, clusterId } = params;

                getClusterFeatures(pg, zoom, clusterId, columns, query, resolution, (err, features) => {
                    if (err) {
                        return callback(err);
                    }

                    return callback(null, features);
                });
            });
        });
    }
};

const SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function getColumnsName (pg, query, callback) {
    const sql = limitedQuery({
        query: query
    });

    debug('> getColumnsName:', sql);

    pg.query(sql, function (err, resultSet) {
        if (err) {
            return callback(err);
        }

        const fields = resultSet.fields || [];
        const columnNames = fields.map(field => field.name)
            .filter(columnName => !SKIP_COLUMNS[columnName]);

        return callback(null, columnNames);
    }, true);
}

function getClusterFeatures (pg, zoom, clusterId, columns, query, resolution, callback) {
    const sql = clusterFeaturesQuery({
        zoom: zoom,
        id: clusterId,
        query: query,
        res: 256/resolution,
        columns: columns
    });

    debug('> getClusterFeatures:', sql);

    pg.query(sql, (err, data) => {
        if (err) {
            return callback(err);
        }

        return callback(null, data);
    } , true); // use read-only transaction
}

const limitedQuery = ctx => `SELECT * FROM (${ctx.query}) __cdb_schema LIMIT 0`;
const clusterFeaturesQuery = ctx => `
    WITH
    _cdb_params AS (
        SELECT
        ${gridResolution(ctx)} AS res
    ),
    _cell AS (
        SELECT
        ST_MakeEnvelope(
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)*_cdb_params.res,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)*_cdb_params.res,
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res + 1)*_cdb_params.res,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res + 1)*_cdb_params.res,
            3857
        ) AS bbox
        FROM (${ctx.query}) _cdb_query, _cdb_params
        WHERE _cdb_query.cartodb_id = ${ctx.id}
    )
    SELECT
        ${ctx.columns.join(', ')}
    FROM (
        SELECT _cdb_query.*
        FROM _cell, (${ctx.query}) _cdb_query
        WHERE ST_Intersects(_cdb_query.the_geom_webmercator, _cell.bbox)
    ) __cdb_non_geoms_query
`;

// SQL expression to compute the aggregation resolution (grid cell size).
// This is defined by the ctx.res parameter, which is the number of grid cells per tile linear dimension
// (i.e. each tile is divided into ctx.res*ctx.res cells).
// We limit the the minimum resolution to avoid division by zero problems. The limit used is
// the pixel size of zoom level 30 (i.e. 1/2*(30+8) of the full earth web-mercator extent), which is about 0.15 mm.
// Computing this using !scale_denominator!, !pixel_width! or !pixel_height! produces
// inaccurate results due to rounding present in those values.
const gridResolution = ctx => {
    const minimumResolution = 2*Math.PI*6378137/Math.pow(2,38);
    const pixelSize = `CDB_XYZ_Resolution(${ctx.zoom})`;
    return `GREATEST(${256/ctx.res}*${pixelSize}, ${minimumResolution})::double precision`;
};
