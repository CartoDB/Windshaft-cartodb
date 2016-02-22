function QueryTablesApi(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

var affectedTableRegexCache = {
    bbox: /!bbox!/g,
    scale_denominator: /!scale_denominator!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g
};

module.exports = QueryTablesApi;


QueryTablesApi.prototype.getAffectedTablesInQuery = function (username, sql, callback) {
    var query = 'SELECT CDB_QueryTablesText($windshaft$' + prepareSql(sql) + '$windshaft$)';

    this.pgQueryRunner.run(username, query, function handleAffectedTablesInQueryRows (err, rows) {
        if (err){
            var msg = err.message ? err.message : err;
            callback(new Error('could not fetch source tables: ' + msg));
            return;
        }

        // This is an Array, so no need to split into parts
        var tableNames = rows[0].cdb_querytablestext;
        return callback(null, tableNames);
    });
};

QueryTablesApi.prototype.getAffectedTablesAndLastUpdatedTime = function (username, sql, callback) {
    var query =
            'SELECT * FROM CDB_QueryTables_Updated_At($windshaft$' + prepareSql(sql) + '$windshaft$)';

    this.pgQueryRunner.run(username, query, function handleAffectedTablesAndLastUpdatedTimeRows (err, rows) {
        if (err) {
            var msg = err.message ? err.message : err;
            callback(new Error('could not fetch affected tables or last updated time: ' + msg));
            return;
        }

        var affectedTables = rows;

        var updatedTimes = affectedTables.map(function getUpdateDate(table) {
            return table.updated_at;
        });
        var lastUpdatedTime = (affectedTables.length === 0 ? 0 : Math.max.apply(null, updatedTimes)) || 0;

        callback(null, {
            affectedTables: affectedTables,
            lastUpdatedTime: lastUpdatedTime
        });
    });
};


function prepareSql(sql) {
    return sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.scale_denominator, '0')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;
}
