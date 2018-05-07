var queryUtils = require('../../utils/query-utils');
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

MapnikLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    let query = layer.options.sql;
    let rawQuery = layer.options.sql_raw ? layer.options.sql_raw : layer.options.sql;
    let metaOptions = layer.options.metadata || {};

    let stats = {};

    // TODO: could save some queries if queryUtils.getAggregationMetadata() has been used and kept somewhere
    // we would set stats.estimatedFeatureCount and stats.geometryType (if metaOptions.geometryType) from it.

    // We'll add promises for queries to be executed to the next two lists;
    // the queries in statQueries2 will be executed after all of statQueries are completed,
    // so any results from them can be used.
    // Query promises will store results in the shared stats object.
    let statQueries = [], statQueries2 = [];

    if (stats.estimatedFeatureCount === undefined) {
        statQueries.push(
            queryPromise(dbConnection, queryUtils.getQueryRowEstimation(query), function(err, res) {
                if (err) {
                    // at least for debugging we should err
                    stats.estimatedFeatureCount = -1;
                    return null;
                } else {
                    // We decided that the relation is 1 row == 1 feature
                    stats.estimatedFeatureCount = res.rows[0].rows;
                    return null;
                }
            })
        );
    }

    if (metaOptions.featureCount) {
        // TODO: if metaOptions.columnStats we can combine this with column stats query
        statQueries.push(
            queryPromise(
                queryUtils.getQueryActualRowCount(rawQuery),
                function(err, res) {
                    if (err) {
                        stats.featureCount = -1;
                    } else {
                        stats.featureCount = res.rows[0].rows;
                    }
                    return err;
                }
            )
        );
    }

    if (metaOptions.sample) {
        const numRows = stats.featureCount === undefined ? stats.estimatedFeatureCount : stats.featureCount;
        const sampleProb = Math.min(metaOptions.sample / numRows, 1);
        statQueries2.push(
            queryPromise(
                queryUtils.getQuerySample(rawQuery, sampleProb),
                function(err, res) {
                    if (err) {
                        stats.sample = [];
                    } else {
                        stats.sample = res.rows;
                    }
                    return err;
                }
            )
        );
    }

    if (metaOptions.geometryType && stats.geometryType === undefined) {
        const geometryColumn = AggregationMapConfig.getAggregationGeometryColumn();
        statQueries.push(
            queryPromise(queryUtils.getQueryGeometryType(rawQuery, geometryColumn), function(err, res) {
                if (!err) {
                    stats.geometryType = res.geom_type;
                }
                return err;
            })
        );
    }

    function columnAggregations(field) {
        if (field.type === 'number') {
            return ['min', 'max', 'avg', 'sum'];
        }
        if (field.type === 'date') { // TODO other types too?
            return ['min', 'max'];
        }
    }

    if (metaOptions.columns || metaOptions.columnStats) {
        statQueries.push(
            // TODO: note we have getLayerColumns in aggregation mapconfig.
            // and also getLayerAggregationColumns which either uses getLayerColumns or derives columns from parameters
            queryPromise(queryUtils.getQueryLimited(rawQuery, 0), function(err, res) {
                if (!err) {
                    stats.columns = res.fields;
                    if (metaOptions.columnStats) {
                        let aggr = [];
                        Object.keys(stats.columns).forEach(name => {
                            aggr = aggr.concat(columnAggregations(stats.columns[name])
                                .map(fn => `${fn}(${name}) AS ${name}_${fn}`));
                            if (stats.columns[name].type === 'string') {
                                statQueries2.push(
                                    queryPromise(topQuery(rawQuery, name, N), function(err, res){
                                        if (!err) {
                                            const topN = metaOptions.columnStats.topCategories || 1024;
                                            // TODO:  metaOptions.columnStats.maxCategories => use PG stats to dismiss columns with more distinct values
                                            statQueries2.push(
                                                queryPromise(
                                                    queryUtils.getQueryTopCategories(rawQuery, topN),
                                                    function(err, res) {
                                                        if (!err) {
                                                            stats.columns[name].categories = res.rows;
                                                        }
                                                        return err;
                                                    }
                                                )
                                            );

                                        }
                                        return err;
                                    })
                                );
                            }
                        })
                        statQueries2.push(
                            queryPromise(`SELECT ${aggr.join(',')} FROM (${rawQuery})`, function(err, res){
                                if (!err) {
                                    Object.keys(stats.columns).forEach(name => {
                                        columnAggregations(stats.columns[name]).forEach(fn => {
                                            stats.columns[name][fn] = res.rows[0][`${name}_${fn}`]
                                        });
                                    });
                                }
                                return err;
                            })
                        );
                    }
                }
                return err;
            })
        );

    }

    Promise.all(statQueries).then( () => {
        Promise.all(statQueries2).then( () => callback(null, stats)  ).catch( err => callback(err) );
    }).catch( err => callback(err) );
};

module.exports = MapnikLayerStats;
