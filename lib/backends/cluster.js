'use strict';

const PSQL = require('cartodb-psql');
const dbParamsFromReqParams = require('../utils/database-params');
const debug = require('debug')('backend:cluster');
const AggregationMapConfig = require('../models/aggregation/aggregation-mapconfig');

const WebMercatorHelper = require('cartodb-query-tables').utils.webMercatorHelper;
const webmercator = new WebMercatorHelper();
const queryUtils = require('../../lib/utils/query-utils');

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
                debug(error);

                return callback(error);
            }

            const { user, layer: layerIndex } = params;
            const mapConfig = new AggregationMapConfig(user, _mapConfig.obj(), pg);
            const layer = mapConfig.getLayer(layerIndex);

            let { aggregation } = params;

            try {
                validateAggregationLayer(mapConfig, layerIndex);
                aggregation = parseAggregation(aggregation);
                validateAggregation(aggregation);
            } catch (error) {
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

            params.aggregation = aggregation;

            getFeatures(pg, layer, params, callback);
        });
    }
};

function getFeatures (pg, layer, params, callback) {
    const query = layer.options.sql_raw;
    const resolution = layer.options.aggregation.resolution || 1;

    getColumnsName(pg, query, (err, columns) => {
        if (err) {
            return callback(err);
        }

        const { zoom, clusterId, aggregation } = params;

        getClusterFeatures(pg, zoom, clusterId, columns, query, resolution, aggregation, callback);
    });
}

const SKIP_COLUMNS = {
    the_geom: true,
    the_geom_webmercator: true
};

function getColumnsName (pg, query, callback) {
    const sql = schemaQuery({
        query: query
    });

    debug('> getColumnsName:', sql);

    pg.query(sql, function (err, resultSet) {
        if (err) {
            return callback(err);
        }

        const fields = resultSet.fields || [];
        const columnNames = fields.map(field => field.name)
            .filter(columnName => !SKIP_COLUMNS[queryUtils.stripQuotes(columnName)]);

        return callback(null, columnNames);
    }, true);
}

function getClusterFeatures (pg, zoom, clusterId, columns, query, resolution, aggregation, callback) {
    let sql = clusterFeaturesQuery({
        zoom: zoom,
        id: clusterId,
        query: query,
        res: 256 / resolution,
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
    }, true); // use read-only transaction
}

const schemaQuery = ctx => `SELECT * FROM (${ctx.query}) __cdb_cluster_schema LIMIT 0`;
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
    const zoomResolution = webmercator.getResolution({ z: Math.min(38, ctx.zoom) });
    return `${256 / ctx.res} * (${zoomResolution})::double precision`;
};

const aggregationQuery = ctx => `
    SELECT
        count(1) as _cdb_feature_count
        ${ctx.columns.length ? `,${ctx.columns.join(', ')}` : ''}
        ${ctx.expressions.length ? `,${ctx.expressions.join(', ')}` : ''}
    FROM (${ctx.query}) __cdb_aggregation
    ${ctx.columns.length ? `GROUP BY ${ctx.columns.join(', ')}` : ''}
`;

function validateAggregationLayer (mapConfig, layerIndex) {
    if (!hasAggregationLayer(mapConfig, layerIndex)) {
        throw new Error(`Map ${mapConfig.id()} has no aggregation defined for layer ${layerIndex}`);
    }
}

// TODO: update when https://github.com/CartoDB/Windshaft-cartodb/pull/1082 is merged
function hasAggregationLayer (mapConfig, layerIndex) {
    const layer = mapConfig.getLayer(layerIndex);

    if (typeof layer.options.aggregation === 'boolean') {
        return layer.options.aggregation;
    }

    return mapConfig.isAggregationLayer(layerIndex);
}

function parseAggregation (aggregation) {
    if (aggregation !== undefined) {
        try {
            aggregation = JSON.parse(aggregation);
        } catch (err) {
            throw new Error('Invalid aggregation input, should be a a valid JSON');
        }
    }

    return aggregation;
}

function validateAggregation (aggregation) {
    if (aggregation !== undefined) {
        const { columns, expressions } = aggregation;

        if (!hasColumns(columns)) {
            throw new Error('Invalid aggregation input, columns should be and array of column names');
        }

        validateExpressions(expressions);
    }
}

function hasColumns (columns) {
    return Array.isArray(columns) && columns.length;
}

function validateExpressions (expressions) {
    if (expressions !== undefined) {
        if (!isValidExpression(expressions)) {
            throw new Error('Invalid aggregation input, expressions should be and object with valid functions');
        }

        for (const { aggregate_function: aggregateFunction, aggregated_column: aggregatedColumn } of Object.values(expressions)) {
            if (typeof aggregatedColumn !== 'string') {
                throw new Error('Invalid aggregation input, aggregated column should be an string');
            }

            if (typeof aggregateFunction !== 'string') {
                throw new Error('Invalid aggregation input, aggregate function should be an string');
            }
        }
    }
}

function isValidExpression (expressions) {
    const invalidTypes = ['string', 'number', 'boolean'];

    return expressions !== null && !Array.isArray(expressions) && !invalidTypes.includes(typeof expressions);
}
