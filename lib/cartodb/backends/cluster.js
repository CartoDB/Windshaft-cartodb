'use strict';

const PSQL = require('cartodb-psql');
const dbParamsFromReqParams = require('../utils/database-params');
const debug = require('debug')('backend:cluster');

module.exports = class ClusterBackend {
    getClusterFeatures (mapConfigProvider, params, callback) {
        mapConfigProvider.getMapConfig((err, mapConfig) => {
            if (err) {
                return callback(err);
            }

            // if (!mapConfig.isAggregationLayer(params.layer)) {
            //     const error = new Error(`Map ${params.token} has no aggregation defined for layer ${params.layer}`);
            //     return callback(error);
            // }

            const layer = mapConfig.getLayer(params.layer);

            let pg;
            try {
                pg = new PSQL(dbParamsFromReqParams(params));
            } catch (error) {
                return callback(error);
            }

            const query = layer.options.sql;
            const resolution = layer.options.aggregation.resolution || 1;

            getColumnsName(pg, query, (err, columns) => {
                if (err) {
                    return callback(err);
                }

                const { clusterId } = params;

                getClusterFeatures(pg, clusterId, columns, query, resolution, (err, features) => {
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
    const sql = replaceTokens(limitedQuery({
        query: query
    }));

    debug(sql);

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

function getClusterFeatures (pg, clusterId, columns, query, resolution, callback) {
    const sql = replaceTokens(clusterFeaturesQuery({
        id: clusterId,
        query: query,
        res: resolution,
        columns: columns
    }));

    debug(sql);

    pg.query(sql, (err, data) => {
        if (err) {
            return callback(err);
        }

        return callback(null, data);
    } , true); // use read-only transaction
}

const SUBSTITUTION_TOKENS = {
    bbox: /!bbox!/g,
    scale_denominator: /!scale_denominator!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g,
    var_zoom: /@zoom/g,
    var_bbox: /@bbox/g,
    var_x: /@x/g,
    var_y: /@y/g,
};

function replaceTokens(sql, replaceValues) {
    if (!sql) {
        return sql;
    }

    replaceValues = replaceValues || {
        bbox: 'ST_MakeEnvelope(0,0,0,0)',
        scale_denominator: '0',
        pixel_width: '1',
        pixel_height: '1',
        var_zoom: '0',
        var_bbox: '[0,0,0,0]',
        var_x: '0',
        var_y: '0'
    };

    Object.keys(replaceValues).forEach(function(token) {
        if (SUBSTITUTION_TOKENS[token]) {
            sql = sql.replace(SUBSTITUTION_TOKENS[token], replaceValues[token]);
        }
    });

    return sql;
}

const limitedQuery = ctx => `SELECT * FROM (${ctx.query}) __cdb_schema LIMIT 0`;
// const nonGeomsQuery = ctx => `SELECT ${ctx.columns.join(', ')} FROM (${ctx.query}) __cdb_non_geoms_query`;
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
    SELECT ${ctx.columns.join(', ')} FROM (
        SELECT _cdb_query.* FROM _cell, (${ctx.query}) _cdb_query
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
    const pixelSize = 'CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!))';
    debug(ctx);
    return `GREATEST(${256/ctx.res}*${pixelSize}, ${minimumResolution})::double precision`;
};
