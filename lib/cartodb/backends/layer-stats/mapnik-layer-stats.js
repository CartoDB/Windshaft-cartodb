var queryUtils = require('../../utils/query-utils');
const AggregationMapConfig = require('../../models/aggregation/aggregation-mapconfig');
var SubstitutionTokens = require('../../utils/substitution-tokens');

// Instantiate a query with tokens for a given zoom level
function queryForZoom(sql, zoom, singleTile=false) {
    const tileRes = 256;
    const wmSize = 6378137.0*2*Math.PI;
    const nTiles = Math.pow(2, zoom);
    const tileSize = wmSize / nTiles;
    const resolution = tileSize / tileRes;
    const scaleDenominator = resolution / 0.00028;
    const x0 = -wmSize/2, y0 = -wmSize/2;
    let bbox = `ST_MakeEnvelope(${x0}, ${y0}, ${x0+wmSize}, ${y0+wmSize})`;
    if (singleTile) {
        bbox = `ST_MakeEnvelope(${x0}, ${y0}, ${x0 + tileSize}, ${y0 + tileSize})`;
    }
    return SubstitutionTokens.replace(sql, {
        bbox: bbox,
        scale_denominator: scaleDenominator,
        pixel_width: resolution,
        pixel_height: resolution
    });
}

function MapnikLayerStats () {
    this._types = {
        mapnik: true,
        cartodb: true
    };
}

MapnikLayerStats.prototype.is = function (type) {
    return this._types[type] ? this._types[type] : false;
};

function columnAggregations(field) {
    if (field.type === 'number') {
        return ['min', 'max', 'avg', 'sum'];
    }
    if (field.type === 'date') { // TODO other types too?
        return ['min', 'max'];
    }
    return [];
}

function _getSQL(ctx, query, type='pre', zoom=0) {
    let sql;
    if (type === 'pre') {
        sql = ctx.preQuery;
    }
    else {
        sql = ctx.aggrQuery;
    }
    sql = queryForZoom(sql, zoom || 0);
    return query(sql);
}

function _estimatedFeatureCount(ctx) {
    return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, queryUtils.getQueryRowEstimation))
        .then(res => ({ estimatedFeatureCount: res.rows[0].rows }))
        .catch(() => ({ estimatedFeatureCount: -1 }));
}

function _featureCount(ctx) {
    if (ctx.metaOptions.featureCount) {
        // TODO: if ctx.metaOptions.columnStats we can combine this with column stats query
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, queryUtils.getQueryActualRowCount))
            .then(res => ({ featureCount: res.rows[0].rows }));
    }
    return Promise.resolve();
}

function _aggrFeatureCount(ctx) {
    if (ctx.metaOptions.hasOwnProperty('aggrFeatureCount')) {
        // We expect as zoom level as the value of aggrFeatureCount
        // TODO: it'd be nice to admit an array of zoom levels to
        // return metadata for multiple levels.
        return queryUtils.queryPromise(
            ctx.dbConnection,
            _getSQL(ctx, queryUtils.getQueryActualRowCount, 'post',  ctx.metaOptions.aggrFeatureCount)
        ).then(res => ({ aggrFeatureCount: res.rows[0].rows }));
    }
    return Promise.resolve();
}

function _geometryType(ctx) {
    if (ctx.metaOptions.geometryType) {
        const geometryColumn = AggregationMapConfig.getAggregationGeometryColumn();
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, sql => queryUtils.getQueryGeometryType(sql, geometryColumn)))
            .then(res => ({ geometryType: res.rows[0].geom_type }));
    }
    return Promise.resolve();
}

function _columns(ctx) {
    if (ctx.metaOptions.columns || ctx.metaOptions.columnStats) {
        // note: post-aggregation columns are in layer.options.columns when aggregation is present
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(ctx, sql => queryUtils.getQueryLimited(sql, 0)))
            .then(res => formatResultFields(ctx.dbConnection, res.fields));
    }
    return Promise.resolve();
}

// combine a list of results merging the properties of all the objects
// undefined results are admitted and ignored
function mergeResults(results) {
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
function mergeColumns(results) {
    if (results) {
        if (results.length === 0) {
            return {};
        }
        return results.reduce((a, b) => {
            let c = Object.assign({}, b || {}, a || {});
            Object.keys(c).forEach(key => {
                if (b.hasOwnProperty(key)) {
                    c[key] = Object.assign(c[key], b[key]);
                }
            });
            return c;
        });
    }
}

const SAMPLE_SEED = 0.5;
const DEFAULT_SAMPLE_ROWS = 100;

function _sample(ctx, numRows) {
    if (ctx.metaOptions.sample) {
        const sampleProb = Math.min(ctx.metaOptions.sample.num_rows / numRows, 1);
        // We'll use a safety limit just in case numRows is a bad estimate
        const requestedRows = ctx.metaOptions.sample.num_rows || DEFAULT_SAMPLE_ROWS;
        const limit = Math.ceil(requestedRows * 1.5);
        let columns = ctx.metaOptions.sample.include_columns;
        return queryUtils.queryPromise(ctx.dbConnection, _getSQL(
            ctx,
            sql => queryUtils.getQuerySample(sql, sampleProb, limit, SAMPLE_SEED, columns)
        )).then(res => ({ sample: res.rows }));
    }
    return Promise.resolve();
}

function _columnStats(ctx, columns) {
    if (!columns) {
        return Promise.resolve();
    }
    if (ctx.metaOptions.columnStats) {
        let queries = [];
        let aggr = [];
        queries.push(new Promise(resolve => resolve(columns))); // add columns as first result
        Object.keys(columns).forEach(name => {
            aggr = aggr.concat(
                columnAggregations(columns[name])
                .map(fn => `${fn}(${name}) AS ${name}_${fn}`)
            );
            if (columns[name].type === 'string') {
                const topN = ctx.metaOptions.columnStats.topCategories || 1024;
                const includeNulls = ctx.metaOptions.columnStats.hasOwnProperty('includeNulls') ?
                    ctx.metaOptions.columnStats.includeNulls :
                    true;

                // TODO:  ctx.metaOptions.columnStats.maxCategories
                //        => use PG stats to dismiss columns with more distinct values
                queries.push(
                    queryUtils.queryPromise(
                        ctx.dbConnection,
                        _getSQL(ctx, sql => queryUtils.getQueryTopCategories(sql, name, topN, includeNulls))
                    ).then(res => ({ [name]: { categories: res.rows } }))
                );
            }
        });
        queries.push(
            queryUtils.queryPromise(
                ctx.dbConnection,
                _getSQL(ctx, sql => `SELECT ${aggr.join(',')} FROM (${sql}) AS __cdb_query`)
            ).then(res => {
                let stats = {};
                Object.keys(columns).forEach(name => {
                    stats[name] = {};
                    columnAggregations(columns[name]).forEach(fn => {
                        stats[name][fn] = res.rows[0][`${name}_${fn}`];
                    });
                });
                return stats;
            })
        );
        return Promise.all(queries).then(results => ({ columns: mergeColumns(results) }));
    }
    return Promise.resolve({ columns });
}

// This is adapted from SQL API:
function fieldType(cname) {
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
    if ( tname && cname.match(/^_/) ) {
        tname += '[]';
    }
    return tname;
}

// columns are returned as an object { columnName1: { type1: ...}, ..}
// for consistency with SQL API
function formatResultFields(dbConnection, fields = []) {
    let nfields = {};
    for (let field of fields) {
      const cname = dbConnection.typeName(field.dataTypeID);
      let tname;
      if ( ! cname ) {
        tname = 'unknown(' + field.dataTypeID + ')';
      } else {
        tname = fieldType(cname);
      }
      nfields[field.name] = { type: tname };
    }
    return nfields;
}

MapnikLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    let aggrQuery = layer.options.sql;
    let preQuery =  layer.options.sql_raw || aggrQuery;

    let ctx = {
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

    Promise.all([
        _estimatedFeatureCount(ctx).then(
            ({ estimatedFeatureCount }) => _sample(ctx, estimatedFeatureCount)
                .then(sampleResults => mergeResults([sampleResults, { estimatedFeatureCount }]))
        ),
        _featureCount(ctx),
        _aggrFeatureCount(ctx),
        _geometryType(ctx),
        _columns(ctx).then(columns => _columnStats(ctx, columns))
    ]).then(results => {
        callback(null, mergeResults(results));
    }).catch(error => {
        callback(error);
    });
};

module.exports = MapnikLayerStats;
