'use strict';

const PSQL = require('cartodb-psql');
const dbParamsFromReqParams = require('../utils/database-params');
const debug = require('debug')('backend:cluster');
const AggregationMapConfig = require('../models/aggregation/aggregation-mapconfig');

module.exports = class ClusterBackend {
    // jshint maxcomplexity: 17
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

            const layer = mapConfig.getLayer(layerIndex);

            if (layer.options.aggregation === false || !mapConfig.isAggregationLayer(layerIndex)) {
                const error = new Error(`Map ${token} has no aggregation defined for layer ${layerIndex}`);
                error.http_status = 400;
                error.type = 'layer';
                error.subtype = 'aggregation';
                error.layer = {
                    index: layerIndex,
                    type: layer.type
                };

                debug(error);
                return callback(error);
            }

            let { aggregation } = params;

            if ( aggregation !== undefined) {
                try {
                    aggregation = JSON.parse(aggregation);
                } catch (err) {
                    const error = new Error(`Invalid aggregation input, should be a a valid JSON`);
                    error.http_status = 400;
                    error.type = 'layer';
                    error.subtype = 'aggregation';
                    error.layer = {
                        index: layerIndex,
                        type: layer.type
                    };

                    return callback(error);
                }

                const { columns, expressions } = aggregation;

                if (!Array.isArray(columns) || !columns.length) {
                    const error = new Error(
                        `Invalid aggregation input, columns should be and array of column names`
                    );
                    error.http_status = 400;
                    error.type = 'layer';
                    error.subtype = 'aggregation';
                    error.layer = {
                        index: layerIndex,
                        type: layer.type
                    };

                    return callback(error);
                }

                if (expressions !== undefined) {
                    if (expressions === null ||
                            Array.isArray(expressions) ||
                            ['string', 'number', 'boolean'].includes(typeof expressions)) {
                        const error = new Error(
                            `Invalid aggregation input, expressions should be and object with valid functions`
                        );
                        error.http_status = 400;
                        error.type = 'layer';
                        error.subtype = 'aggregation';
                        error.layer = {
                            index: layerIndex,
                            type: layer.type
                        };

                        return callback(error);
                    }

                    for (const { aggregate_function, aggregated_column } of Object.values(expressions)) {
                        if (typeof aggregated_column !== 'string') {
                            const error = new Error(`Invalid aggregation input, aggregated column should be an string`);
                            error.http_status = 400;
                            error.type = 'layer';
                            error.subtype = 'aggregation';
                            error.layer = {
                                index: layerIndex,
                                type: layer.type
                            };

                            return callback(error);
                        }

                        if (typeof aggregate_function !== 'string') {
                            const error = new Error(
                                `Invalid aggregation input, aggregate function should be an string`
                            );
                            error.http_status = 400;
                            error.type = 'layer';
                            error.subtype = 'aggregation';
                            error.layer = {
                                index: layerIndex,
                                type: layer.type
                            };

                            return callback(error);
                        }
                    }
                }
            }

            const query = layer.options.sql_raw;
            const resolution = layer.options.aggregation.resolution || 1;

            getColumnsName(pg, query, (err, columns) => {
                if (err) {
                    return callback(err);
                }

                const { zoom, clusterId } = params;

                getClusterFeatures(pg, zoom, clusterId, columns, query, resolution, aggregation, (err, features) => {
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

function getClusterFeatures (pg, zoom, clusterId, columns, query, resolution, aggregation, callback) {
    let sql = clusterFeaturesQuery({
        zoom: zoom,
        id: clusterId,
        query: query,
        res: 256/resolution,
        columns: columns
    });

    if (aggregation !== undefined) {
        let { columns = [], expressions = [] } = aggregation;

        if (expressions) {
            expressions = Object.entries(expressions)
                .map(([columnName, exp]) => `${exp.aggregate_function}(${exp.aggregated_column}) AS ${columnName}`);
        }

        sql = aggregationQuery({
            columns,
            expressions,
            query: sql
        });
    }

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

const gridResolution = ctx => {
    const minimumResolution = 2*Math.PI*6378137/Math.pow(2,38);
    const pixelSize = `CDB_XYZ_Resolution(${ctx.zoom})`;
    return `GREATEST(${256/ctx.res}*${pixelSize}, ${minimumResolution})::double precision`;
};

const aggregationQuery = ctx => `
    SELECT
        count(1) as _cdb_feature_count
        ${ctx.columns.length ? `,${ctx.columns.join(', ')}` : ''}
        ${ctx.expressions.length ? `,${ctx.expressions.join(', ')}` : ''}
    FROM (${ctx.query}) __cdb_aggregation
    ${ctx.columns.length ? `GROUP BY ${ctx.columns.join(', ')}` : ''}
`;
