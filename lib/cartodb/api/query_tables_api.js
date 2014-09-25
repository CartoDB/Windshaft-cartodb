var sqlApi = require('../sql/sql_api'),
    PSQL   = require('cartodb-psql');

function QueryTablesApi() {
}

var affectedTableRegexCache = {
    bbox: /!bbox!/g,
    scale_denominator: /!scale_denominator!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g
};

module.exports = QueryTablesApi;

QueryTablesApi.prototype.getLastUpdatedTime = function (username, api_key, tableNames, callback) {
    var sql = 'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max FROM CDB_TableMetadata m WHERE m.tabname = any (ARRAY['+
        tableNames.map(function(t) { return "'" + t + "'::regclass"; }).join(',') +
        '])';

    // call sql api
    sqlApi.query(username, api_key, sql, function(err, rows){
        if (err){
            var msg = err.message ? err.message : err;
            callback(new Error('could not find last updated timestamp: ' + msg));
            return;
        }
        // when the table has not updated_at means it hasn't been changed so a default last_updated is set
        var last_updated = 0;
        if(rows.length !== 0) {
            last_updated = rows[0].max || 0;
        }

        callback(null, last_updated*1000);
    });
};

QueryTablesApi.prototype.getAffectedTablesInQuery = function (username, options, sql, callback) {

    var query = 'SELECT CDB_QueryTables($windshaft$' + prepareSql(sql) + '$windshaft$)';

    runQuery(username, options, query, handleAffectedTablesInQueryRows, callback);
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

QueryTablesApi.prototype.getAffectedTablesAndLastUpdatedTime = function (username, options, sql, callback) {

    var query = [
        'WITH querytables AS (',
            'SELECT * FROM CDB_QueryTables($windshaft$' + prepareSql(sql) + '$windshaft$) as tablenames',
        ')',
        'SELECT (SELECT tablenames FROM querytables), EXTRACT(EPOCH FROM max(updated_at)) as max',
        'FROM CDB_TableMetadata m',
        'WHERE m.tabname = any ((SELECT tablenames from querytables)::regclass[])'
    ].join(' ');

    runQuery(username, options, query, handleAffectedTablesAndLastUpdatedTimeRows, callback);
};

function handleAffectedTablesAndLastUpdatedTimeRows(err, rows, callback) {
    if (err || rows.length === 0) {
        var msg = err.message ? err.message : err;
        callback(new Error('could not fetch affected tables and last updated time: ' + msg));
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


function runQuery(username, options, query, queryHandler, callback) {
    if (shouldQueryPostgresDirectly()) {
        var psql = new PSQL(options);
        psql.query(query, function(err, resultSet) {
            var rows = resultSet.rows || [];
            queryHandler(err, rows, callback);
        });
    } else {
        sqlApi.query(username, options.api_key, query, function(err, rows) {
            queryHandler(err, rows, callback);
        });
    }
}


function prepareSql(sql) {
    return sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.scale_denominator, '0')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;
}


function shouldQueryPostgresDirectly() {
    return global.environment
        && global.environment.enabledFeatures
        && global.environment.enabledFeatures.cdbQueryTablesFromPostgres;
}
