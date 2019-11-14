'use strict';

const queryUtils = require('../../utils/query-utils');
const AggregationMapConfig = require('../../models/aggregation/aggregation-mapconfig');
const aggregationQuery = require('../../models/aggregation/aggregation-query');

function MapnikLayerStats () {
    this._types = {
        mapnik: true,
        cartodb: true
    };
}

MapnikLayerStats.prototype.is = function (type) {
    return this._types[type] ? this._types[type] : false;
};

function columnAggregations (field) {
    if (field.type === 'number') {
        return ['min', 'max', 'avg', 'sum'];
    }
    if (field.type === 'date') { // TODO other types too?
        return ['min', 'max'];
    }
    if (field.type === 'timeDimension') {
        return ['min', 'max'];
    }
    return [];
}

function _getSQL (ctx, query, type = 'pre', zoom = 0) {
    let sql;
    if (type === 'pre') {
        sql = ctx.preQuery;
    } else {
        sql = ctx.aggrQuery;
    }
    sql = queryUtils.substituteTokensForZoom(sql, zoom || 0);
    return query(sql);
}

function _estimatedFeatureCount (ctx) {
    return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, queryUtils.getQueryRowEstimation))
        .then(res => ({ estimatedFeatureCount: res.rows[0].rows }))
        .catch(() => ({ estimatedFeatureCount: -1 }));
}

function _featureCount (ctx) {
    if (ctx.metaOptions.featureCount) {
        // TODO: if ctx.metaOptions.columnStats we can combine this with column stats query
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, queryUtils.getQueryActualRowCount))
            .then(res => ({ featureCount: res.rows[0].rows }));
    }
    return Promise.resolve();
}

function _aggrFeatureCount (ctx) {
    if (Object.prototype.hasOwnProperty.call(ctx.metaOptions, 'aggrFeatureCount')) {
        // We expect as zoom level as the value of aggrFeatureCount
        // TODO: it'd be nice to admit an array of zoom levels to
        // return metadata for multiple levels.
        return queryUtils.queryPromise(
            ctx.dbConnection,
            _getSQL(ctx, queryUtils.getQueryActualRowCount, 'post', ctx.metaOptions.aggrFeatureCount)
        ).then(res => ({ aggrFeatureCount: res.rows[0].rows }));
    }
    return Promise.resolve();
}

function _geometryType (ctx) {
    if (ctx.metaOptions.geometryType) {
        const geometryColumn = AggregationMapConfig.getAggregationGeometryColumn();
        const sqlQuery = _getSQL(ctx, sql => queryUtils.getQueryGeometryType(sql, geometryColumn));
        return queryUtils.queryPromise(ctx.dbConnection, sqlQuery)
            .then(res => ({ geometryType: (res.rows[0] || {}).geom_type }));
    }
    return Promise.resolve();
}

function _columns (ctx) {
    if (ctx.metaOptions.columns || ctx.metaOptions.columnStats || ctx.metaOptions.dimensions) {
        // note: post-aggregation columns are in layer.options.columns when aggregation is present
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, sql => queryUtils.getQueryLimited(sql, 0)))
            .then(res => formatResultFields(ctx.dbConnection, res.fields));
    }
    return Promise.resolve();
}

// combine a list of results merging the properties of all the objects
// undefined results are admitted and ignored
function mergeResults (results) {
    if (results) {
        if (results.length === 0) {
            return {};
        }
        return results.reduce((a, b) => {
            if (a === undefined) {
                return b;
            }
            if (b === undefined) {
                return a;
            }
            return Object.assign({}, a, b);
        });
    }
}

// deeper (1 level) combination of a list of objects:
// mergeColumns([{ col1: { a: 1 }, col2: { a: 2 } }, { col1: { b: 3 } }]) => { col1: { a: 1, b: 3 }, col2: { a: 2 } }
function mergeColumns (results) {
    if (results) {
        if (results.length === 0) {
            return {};
        }
        return results.reduce((a, b) => {
            const c = Object.assign({}, b || {}, a || {});
            Object.keys(c).forEach(key => {
                if (Object.prototype.hasOwnProperty.call(b, key)) {
                    c[key] = Object.assign(c[key], b[key]);
                }
            });
            return c;
        });
    }
}

const DEFAULT_SAMPLE_ROWS = 100;

function _sample (ctx) {
    if (!ctx.metaOptions.sample) {
        return Promise.resolve();
    }

    const limit = ctx.metaOptions.sample.num_rows || DEFAULT_SAMPLE_ROWS;
    const columns = ctx.metaOptions.sample.include_columns;

    const sqlMaxMin = _getSQL(ctx, sql => queryUtils.getMaxMinSpanColumnQuery(sql));
    return queryUtils.queryPromise(ctx.dbConnection, sqlMaxMin)
        .then(maxMinRes => {
            const { min_id: min, id_span: span } = maxMinRes.rows[0];

            if (!min || !span) {
                return { rows: {} };
            }

            const values = _getSampleValuesFromRange(min, span, limit);
            const sqlSample = _getSQL(ctx, sql => queryUtils.getSampleFromIdsQuery(sql, values, columns));

            return queryUtils.queryPromise(ctx.dbConnection, sqlSample);
        })
        .then(res => ({ sample: res.rows }));
}

function _getSampleValuesFromRange (min, span, limit) {
    const sample = new Set();

    limit = limit < span ? limit : span;

    while (sample.size < limit) {
        sample.add(Math.floor(min + Math.random() * span));
    }

    return Array.from(sample);
}

function _columnsMetadataRequired (options) {
    // We need determine the columns of a query
    // if either column stats or dimension stats are required,
    // since we'll ultimately use the same query to fetch both
    return options.columnStats || options.dimensions;
}

function _columnStats (ctx, columns, dimensions) {
    if (!columns) {
        return Promise.resolve();
    }
    if (_columnsMetadataRequired(ctx.metaOptions)) {
        const queries = [];
        let aggr = [];
        if (ctx.metaOptions.columnStats) {
            queries.push(new Promise(resolve => resolve({ columns }))); // add columns as first result
            Object.keys(columns).forEach(name => {
                aggr = aggr.concat(
                    columnAggregations(columns[name])
                        .map(fn => `${fn}("${name}") AS "${name}_${fn}"`)
                );
                if (columns[name].type === 'string') {
                    const topN = ctx.metaOptions.columnStats.topCategories || 1024;
                    const includeNulls = Object.prototype.hasOwnProperty.call(ctx.metaOptions.columnStats, 'includeNulls')
                        ? ctx.metaOptions.columnStats.includeNulls
                        : true;

                    // TODO:  ctx.metaOptions.columnStats.maxCategories
                    //        => use PG stats to dismiss columns with more distinct values
                    queries.push(
                        queryUtils.queryPromise(
                            ctx.dbConnection,
                            _getSQL(ctx, sql => queryUtils.getQueryTopCategories(sql, name, topN, includeNulls))
                        ).then(res => ({ columns: { [name]: { categories: res.rows } } }))
                    );
                }
            });
        }
        const dimensionsStats = {};
        let dimensionsInfo = {};
        if (ctx.metaOptions.dimensions && dimensions) {
            dimensionsInfo = aggregationQuery.infoForOptions({ dimensions });
            Object.keys(dimensionsInfo).forEach(dimName => {
                const info = dimensionsInfo[dimName];
                if (info.type === 'timeDimension') {
                    dimensionsStats[dimName] = {
                        params: info.params
                    };
                    aggr = aggr.concat(
                        columnAggregations(info).map(fn => `${fn}(${info.sql}) AS "${dimName}_${fn}"`)
                    );
                }
            });
        }
        queries.push(
            queryUtils.queryPromise(
                ctx.dbConnection,
                _getSQL(ctx, sql => `SELECT ${aggr.join(',')} FROM (${sql}) AS __cdb_query`)
            ).then(res => {
                const stats = { columns: {}, dimensions: {} };
                Object.keys(columns).forEach(name => {
                    stats.columns[name] = {};
                    columnAggregations(columns[name]).forEach(fn => {
                        stats.columns[name][fn] = res.rows[0][`${name}_${fn}`];
                    });
                });
                Object.keys(dimensionsInfo).forEach(name => {
                    stats.dimensions[name] = stats.dimensions[name] || Object.assign({}, dimensionsStats[name]);
                    let type = null;
                    columnAggregations(dimensionsInfo[name]).forEach(fn => {
                        type = type ||
                            fieldTypeSafe(ctx.dbConnection, res.fields.find(f => f.name === `${name}_${fn}`));
                        stats.dimensions[name][fn] = res.rows[0][`${name}_${fn}`];
                    });
                    stats.dimensions[name].type = type;
                });
                return stats;
            })
        );
        return Promise.all(queries).then(results => ({
            columns: mergeColumns(results.map(r => r.columns)),
            dimensions: mergeColumns(results.map(r => r.dimensions))
        }));
    }
    return Promise.resolve({ columns });
}

// This is adapted from SQL API:
function fieldType (cname) {
    let tname;
    switch (true) {
    case /bool/.test(cname):
        tname = 'boolean';
        break;
    case /int|float|numeric/.test(cname):
        tname = 'number';
        break;
    case /text|char|unknown/.test(cname):
        tname = 'string';
        break;
    case /date|time/.test(cname):
        tname = 'date';
        break;
    default:
        tname = cname;
    }
    if (tname && cname.match(/^_/)) {
        tname += '[]';
    }
    return tname;
}

function fieldTypeSafe (dbConnection, field) {
    const cname = dbConnection.typeName(field.dataTypeID);
    return cname ? fieldType(cname) : `unknown(${field.dataTypeID})`;
}

// columns are returned as an object { columnName1: { type1: ...}, ..}
// for consistency with SQL API
function formatResultFields (dbConnection, fields = []) {
    const nfields = {};
    for (const field of fields) {
        nfields[field.name] = { type: fieldTypeSafe(dbConnection, field) };
    }
    return nfields;
}

MapnikLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    const aggrQuery = layer.options.sql;
    const preQuery = layer.options.sql_raw || aggrQuery;

    const ctx = {
        dbConnection,
        preQuery,
        aggrQuery,
        metaOptions: layer.options.metadata || {}
    };

    // TODO: could save some queries if queryUtils.getAggregationMetadata() has been used and kept somewhere
    // we would set queries.results.estimatedFeatureCount and queries.results.geometryType
    // (if metaOptions.geometryType) from it.

    // TODO: compute _sample with _featureCount when available
    // TODO: add support for sample.exclude option by, in that case, forcing the columns query and
    // passing the results to the sample query function.

    const dimensions = (layer.options.aggregation || {}).dimensions;

    Promise.all([
        _estimatedFeatureCount(ctx).then(
            ({ estimatedFeatureCount }) => _sample(ctx)
                .then(sampleResults => mergeResults([sampleResults, { estimatedFeatureCount }]))
        ),
        _featureCount(ctx),
        _aggrFeatureCount(ctx),
        _geometryType(ctx),
        _columns(ctx).then(columns => _columnStats(ctx, columns, dimensions))
    ]).then(results => {
        results = mergeResults(results);
        callback(null, results);
    }).catch(error => {
        callback(error);
    });
};

module.exports = MapnikLayerStats;
