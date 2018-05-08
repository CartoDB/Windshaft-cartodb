var queryUtils = require('../../utils/query-utils');
const PhasedExecution = require('../../utils/phased-execution');
const AggregationMapConfig = require('../../models/aggregation/aggregation-mapconfig');

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

function firstPhaseQueries(queries, ctx) {
    if (queries.results.estimatedFeatureCount === undefined) {
        queries.task(
            queryPromise(ctx.dbConnection, queryUtils.getQueryRowEstimation(ctx.query), function(err, res) {
                if (err) {
                    // at least for debugging we should err
                    queries.results.estimatedFeatureCount = -1;
                    return null;
                } else {
                    // We decided that the relation is 1 row == 1 feature
                    queries.results.estimatedFeatureCount = res.rows[0].rows;
                    return null;
                }
            })
        );
    }

    if (ctx.metaOptions.featureCount) {
        // TODO: if ctx.metaOptions.columnStats we can combine this with column stats query
        queries.task(
            queryPromise(
                ctx.dbConnection,
                queryUtils.getQueryActualRowCount(ctx.rawQuery),
                (err, res) => {
                    if (err) {
                        queries.results.featureCount = -1;
                    } else {
                        queries.results.featureCount = res.rows[0].rows;
                    }
                    return err;
                }
            )
        );
    }

    if (ctx.metaOptions.geometryType && queries.results.geometryType === undefined) {
        const geometryColumn = AggregationMapConfig.getAggregationGeometryColumn();
        queries.task(
            queryPromise(
                ctx.dbConnection,
                queryUtils.getQueryGeometryType(ctx.rawQuery, geometryColumn),
                (err, res) => {
                    if (!err) {
                        queries.results.geometryType = res.rows[0].geom_type;
                    }
                    return err;
                }
            )
        );
    }

    if (ctx.metaOptions.columns || ctx.metaOptions.columnStats) {
        queries.task(
            // TODO: note we have getLayerColumns in aggregation mapconfig.
            // and also getLayerAggregationColumns which either uses getLayerColumns or derives columns from parameters
            queryPromise(
                ctx.dbConnection,
                queryUtils.getQueryLimited(ctx.rawQuery, 0),
                (err, res) => {
                    if (!err) {
                        queries.results.columns = formatResultFields(ctx.dbConnection, res.fields);
                    }
                    return err;
                }
            )
        );
    }
}

function secondPhaseQueries(queries, ctx) {
    if (ctx.metaOptions.sample) {
        const numRows = queries.results.featureCount === undefined ?
            queries.results.estimatedFeatureCount :
            queries.results.featureCount;
        const sampleProb = Math.min(ctx.metaOptions.sample / numRows, 1);
        queries.task(
            queryPromise(
                ctx.dbConnection,
                queryUtils.getQuerySample(ctx.rawQuery, sampleProb),
                (err, res) => {
                    if (err) {
                        queries.results.sample = [];
                    } else {
                        queries.results.sample = res.rows;
                    }
                    return err;
                }
            )
        );
    }

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
                queries.task(
                    queryPromise(
                        ctx.dbConnection,
                        queryUtils.getQueryTopCategories(ctx.rawQuery, name, topN),
                        (err, res) => {
                            if (!err) {
                                queries.results.columns[name].categories = res.rows;
                            }
                            return err;
                        }
                    )
                );
            }
        });
        queries.task(
            queryPromise(
                ctx.dbConnection,
                `SELECT ${aggr.join(',')} FROM (${ctx.rawQuery}) AS __cdb_query`,
                (err, res) => {
                    if (!err) {
                        Object.keys(queries.results.columns).forEach(name => {
                            columnAggregations(queries.results.columns[name]).forEach(fn => {
                                queries.results.columns[name][fn] = res.rows[0][`${name}_${fn}`];
                            });
                        });
                    }
                    return err;
                }
            )
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
    let context = {
        dbConnection,
        query: layer.options.sql,
        rawQuery: layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql,
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
