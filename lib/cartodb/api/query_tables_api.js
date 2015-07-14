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

    var query = 'SELECT CDB_QueryTables($windshaft$' + prepareSql(sql) + '$windshaft$)';

    this.pgQueryRunner.run(username, query, handleAffectedTablesInQueryRows, callback);
};

function handleAffectedTablesInQueryRows(err, rows, callback) {
    if (err){
        var msg = err.message ? err.message : err;
        callback(new Error('could not fetch source tables: ' + msg));
        return;
    }
    var qtables = rows[0].cdb_querytables;
    var tableNames = qtables.split(/^\{(.*)\}$/)[1];
    tableNames = tableNames ? tableNames.split(',') : [];
    callback(null, tableNames);
}

QueryTablesApi.prototype.getAffectedTablesAndLastUpdatedTime = function (username, sql, callback) {

    var query = [
        'WITH querytables AS (',
            'SELECT * FROM CDB_QueryTables($windshaft$' + prepareSql(sql) + '$windshaft$) as tablenames',
        ')',
        'SELECT (SELECT tablenames FROM querytables), EXTRACT(EPOCH FROM max(updated_at)) as max',
        'FROM CDB_TableMetadata m',
        'WHERE m.tabname = any ((SELECT tablenames from querytables)::regclass[])'
    ].join(' ');

    this.pgQueryRunner.run(username, query, handleAffectedTablesAndLastUpdatedTimeRows, callback);
};

function handleAffectedTablesAndLastUpdatedTimeRows(err, rows, callback) {
    if (err || rows.length === 0) {
        var msg = err.message ? err.message : err;
        callback(new Error('could not fetch affected tables or last updated time: ' + msg));
        return;
    }

    var result = rows[0];

    var tableNames = result.tablenames.split(/^\{(.*)\}$/)[1];
    tableNames = tableNames ? tableNames.split(',') : [];

    var lastUpdatedTime = result.max || 0;

    callback(null, {
        affectedTables: tableNames,
        lastUpdatedTime: lastUpdatedTime * 1000
    });
}

QueryTablesApi.prototype.getLastUpdatedTime = function (username, tableNames, callback) {
    if (!Array.isArray(tableNames) || tableNames.length === 0) {
        return callback(null, 0);
    }

    var query = [
        'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max',
        'FROM CDB_TableMetadata m WHERE m.tabname = any (ARRAY[',
            tableNames.map(function(t) { return "'" + t + "'::regclass"; }).join(','),
        '])'
    ].join(' ');

    this.pgQueryRunner.run(username, query, handleLastUpdatedTimeRows, callback);
};

function handleLastUpdatedTimeRows(err, rows, callback) {
    if (err) {
        var msg = err.message ? err.message : err;
        return callback(new Error('could not fetch affected tables or last updated time: ' + msg));
    }
    // when the table has not updated_at means it hasn't been changed so a default last_updated is set
    var lastUpdated = 0;
    if (rows.length !== 0) {
        lastUpdated = rows[0].max || 0;
    }

    return callback(null, lastUpdated*1000);
}

function prepareSql(sql) {
    return sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.scale_denominator, '0')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;
}
