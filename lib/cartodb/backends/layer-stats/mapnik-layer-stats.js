var queryUtils = require('../../utils/query-utils');
const PhasedExecution = require('../../utils/phased-execution');
const AggregationMapConfig = require('../../models/aggregation/aggregation-mapconfig');
var SubstitutionTokens = require('../../utils/substitution-tokens');

// Instantiate a query with tokens for a given zoom level
function queryForZoom(sql, zoom) {
    const tileRes = 256;
    const wmSize = 6378137.0*2*Math.PI;
    const nTiles = Math.pow(2, zoom);
    const tileSize = wmSize / nTiles;
    const resolution = tileSize / tileRes;
    const scaleDenominator = resolution / 0.00028;
    const x0 = -wmSize/2, y0 = -wmSize/2;
    return SubstitutionTokens.replace(sql, {
        bbox: `ST_MakeEnvelope(${x0}, ${y0}, ${x0 + tileSize}, ${y0 + tileSize})`,
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

function queryPromise(dbConnection, query, callback) {
    return new Promise(function(resolve, reject) {
        dbConnection.query(query, function (err, res) {
            err = callback(err, res);
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });

    });
}

function columnAggregations(field) {
    if (field.type === 'number') {
        return ['min', 'max', 'avg', 'sum'];
    }
    if (field.type === 'date') { // TODO other types too?
        return ['min', 'max'];
    }
    return [];
}

/* Helper to add a task to the queries PhasedExecution
 * type can be either 'pre' (for pre-aggregation metadata) or 'post'
 * zoom is used only for post-aggregation metadata
 * query is a function that generates a metadata query from a data query
 * assign is a function to assign the results of the metadata query
 * if a assignDefault function is present, it will be used in case of error
 * during the query execution and any errors will be ignored
 */
function addStat(queries, ctx, type, zoom, query, assign, assignDefault=null) {
    let sql;
    if (type === 'pre') {
        sql = ctx. preQuery;
    }
    else {
        sql = queryForZoom(ctx.aggrQuery, zoom);
    }
    sql = query(sql);
    queries.task(
        queryPromise(
            ctx.dbConnection,
            sql,
            (err, res) => {
                if (!err) {
                    assign(res);
                }
                else if (assignDefault !== null) {
                    assignDefault();
                    return null;
                }
                return err;
            }
        )
    );
}
function firstPhaseQueries(queries, ctx) {
    // estimatedFeatureCount
    if (queries.results.estimatedFeatureCount === undefined) {
        // This is always computed; a default value of -1 is used in case of error
        addStat(
            queries,
            ctx,
            'pre', 0,
            queryUtils.getQueryRowEstimation,
            res => queries.results.estimatedFeatureCount = res.rows[0].rows,
            () => queries.results.estimatedFeatureCount = -1
        );
    }

    // featureCount
    if (ctx.metaOptions.featureCount) {
        // TODO: if ctx.metaOptions.columnStats we can combine this with column stats query
        addStat(
            queries,
            ctx,
            'pre', 0,
            queryUtils.getQueryActualRowCount,
            res => queries.results.featureCount = res.rows[0].rows
        );
    }

    // geometryType
    if (ctx.metaOptions.geometryType && queries.results.geometryType === undefined) {
        const geometryColumn = AggregationMapConfig.getAggregationGeometryColumn();
        addStat(
            queries,
            ctx,
            'pre', 0,
            sql => queryUtils.getQueryGeometryType(sql, geometryColumn),
            res => queries.results.geometryType = res.rows[0].geom_type
        );
    }

    // columns (names & types)
    if (ctx.metaOptions.columns || ctx.metaOptions.columnStats) {
        // note: post-aggregation columns are in layer.options.columns when aggregation is present
        addStat(
            queries,
            ctx,
            'pre', 0,
            sql => queryUtils.getQueryLimited(sql, 0),
            res => queries.results.columns = formatResultFields(ctx.dbConnection, res.fields)
        );
    }
}

function secondPhaseQueries(queries, ctx) {
    // sample
    if (ctx.metaOptions.sample) {
        const numRows = queries.results.featureCount === undefined ?
            queries.results.estimatedFeatureCount :
            queries.results.featureCount;
        const sampleProb = Math.min(ctx.metaOptions.sample / numRows, 1);
        addStat(
            queries,
            ctx,
            'pre', 0,
            sql => queryUtils.getQuerySample(sql, sampleProb),
            res => queries.results.sample = res.rows
        );
    }

    // columnStats
    if (ctx.metaOptions.columnStats) {
        let aggr = [];
        Object.keys(queries.results.columns).forEach(name => {
            aggr = aggr.concat(
                columnAggregations(queries.results.columns[name])
                .map(fn => `${fn}(${name}) AS ${name}_${fn}`)
            );
            if (queries.results.columns[name].type === 'string') {
                const topN = ctx.metaOptions.columnStats.topCategories || 1024;
                // TODO:  ctx.metaOptions.columnStats.maxCategories
                //        => use PG stats to dismiss columns with more distinct values
                addStat(
                    queries,
                    ctx,
                    'pre', 0,
                    sql => queryUtils.getQueryTopCategories(sql, name, topN),
                    res => queries.results.columns[name].categories = res.rows
                );
            }
        });
        addStat(
            queries,
            ctx,
            'pre', 0,
            sql => `SELECT ${aggr.join(',')} FROM (${sql}) AS __cdb_query`,
            res => {
                Object.keys(queries.results.columns).forEach(name => {
                    columnAggregations(queries.results.columns[name]).forEach(fn => {
                        queries.results.columns[name][fn] = res.rows[0][`${name}_${fn}`];
                    });
                });
            }
        );
    }

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
function formatResultFields(dbConnection, flds) {
    flds = flds || [];
    var nfields = {};
    for (var i=0; i<flds.length; ++i) {
      var f = flds[i];
      var cname = dbConnection.typeName(f.dataTypeID);
      var tname;
      if ( ! cname ) {
        tname = 'unknown(' + f.dataTypeID + ')';
      } else {
        tname = fieldType(cname);
      }
      nfields[f.name] = { type: tname };
    }
    return nfields;
}

MapnikLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    let aggrQuery = layer.options.sql_raw || layer.options.sql;
    let preQuery = layer.options.aggregation_metadata ?
        layer.options.aggregation_metadata.pre_aggregation_sql :
        aggrQuery;

    let context = {
        dbConnection,
        preQuery,
        aggrQuery,
        aggrMeta: layer.options.aggregation_metadata,
        metaOptions: layer.options.metadata || {}
    };

    let queries = new PhasedExecution();

    // TODO: could save some queries if queryUtils.getAggregationMetadata() has been used and kept somewhere
    // we would set queries.results.estimatedFeatureCount and queries.results.geometryType
    // (if metaOptions.geometryType) from it.

    // Queries will be executed in two phases, with results from the first phase needed
    // to define the queries of the second phase
    queries.phase(() => firstPhaseQueries(queries, context));
    queries.phase(() => secondPhaseQueries(queries, context));
    queries.run()
        .then(results => callback(null, results))
        .catch(error => callback(error));

};

module.exports = MapnikLayerStats;
