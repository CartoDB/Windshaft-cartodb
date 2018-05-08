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
                queryUtils.getQueryActualRowCount(ctx.rawQuery),
                function(err, res) {
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
            queryPromise(queryUtils.getQueryGeometryType(ctx.rawQuery, geometryColumn), function(err, res) {
                if (!err) {
                    queries.results.geometryType = res.geom_type;
                }
                return err;
            })
        );
    }

    if (ctx.metaOptions.columns || ctx.metaOptions.columnStats) {
        queries.task(
            // TODO: note we have getLayerColumns in aggregation mapconfig.
            // and also getLayerAggregationColumns which either uses getLayerColumns or derives columns from parameters
            queryPromise(queryUtils.getQueryLimited(ctx.rawQuery, 0), function(err, res) {
                if (!err) {
                    queries.results.columns = res.fields;
                }
                return err;
            })
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
                queryUtils.getQuerySample(ctx.rawQuery, sampleProb),
                function(err, res) {
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
            aggr = aggr.concat(columnAggregations(queries.results.columns[name])
                .map(fn => `${fn}(${name}) AS ${name}_${fn}`));
            if (queries.results.columns[name].type === 'string') {
                const topN = ctx.metaOptions.columnStats.topCategories || 1024;
                // TODO:  ctx.metaOptions.columnStats.maxCategories
                //        => use PG stats to dismiss columns with more distinct values
                queries.task(
                    queryPromise(queryUtils.getQueryTopCategories(ctx.rawQuery, name, topN), function(err, res){
                        if (!err) {
                            queries.results.columns[name].categories = res.rows;
                        }
                        return err;
                    })
                );
            }
        });
        queries.task(
            queryPromise(`SELECT ${aggr.join(',')} FROM (${ctx.rawQuery})`, function(err, res){
                if (!err) {
                    Object.keys(queries.results.columns).forEach(name => {
                        columnAggregations(queries.results.columns[name]).forEach(fn => {
                            queries.results.columns[name][fn] = res.rows[0][`${name}_${fn}`];
                        });
                    });
                }
                return err;
            })
        );
    }

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

    // We'll add promises for queries to be executed to the next two lists;
    // the queries in statQueries2 will be executed after all of statQueries are completed,
    // so any results from them can be used.
    // Query promises will store results in the shared stats object.

    // Queries will be executed in two phases, with results from the first phase needed
    // to define the queries of the second phase
    queries.phase(() => firstPhaseQueries(queries, context));
    queries.phase(() => secondPhaseQueries(queries, context));
    queries.run(results => callback(null, results)).catch(error => callback(error));
};

module.exports = MapnikLayerStats;
