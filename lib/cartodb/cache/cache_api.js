var _       = require('underscore'),
    request = require('request');

function QueryTablesApi() {
}

var affectedTableRegexCache = {
    bbox: /!bbox!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g
};

module.exports = QueryTablesApi;

QueryTablesApi.prototype.getLastUpdatedTime = function (username, api_key, tableNames, callback) {
    var sql = 'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max FROM CDB_TableMetadata m WHERE m.tabname = any (ARRAY['+
        tableNames.map(function(t) { return "'" + t + "'::regclass"; }).join(',') +
        '])';

    // call sql api
    sqlQuery(username, api_key, sql, function(err, rows){
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

QueryTablesApi.prototype.getAffectedTablesInQuery = function (username, api_key, sql, callback) {
    // Replace mapnik tokens
    sql = sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;

    // Pass to CDB_QueryTables
    sql = 'SELECT CDB_QueryTables($windshaft$' + sql + '$windshaft$)';

    // call sql api
    sqlQuery(username, api_key, sql, function(err, rows){
        if (err){
            var msg = err.message ? err.message : err;
            callback(new Error('could not fetch source tables: ' + msg));
            return;
        }
        var qtables = rows[0].cdb_querytables;
        var tableNames = qtables.split(/^\{(.*)\}$/)[1];
        tableNames = tableNames ? tableNames.split(',') : [];
        callback(null, tableNames);
    });
};

QueryTablesApi.prototype.getAffectedTablesAndLastUpdatedTime = function (username, api_key, sql, callback) {
    sql = sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;

    var query = [
        'SELECT',
        'CDB_QueryTables($windshaft$' + sql + '$windshaft$) as tablenames,',
        'EXTRACT(EPOCH FROM max(updated_at)) as max',
            'FROM CDB_TableMetadata m',
            'WHERE m.tabname = any (CDB_QueryTables($windshaft$' + sql + '$windshaft$)::regclass[])'
    ].join(' ');

    sqlQuery(username, api_key, query, function(err, rows){
        if (err || rows.length === 0) {
            var msg = err.message ? err.message : err;
            callback(new Error('could not fetch affected tables and last updated time: ' + msg));
            return;
        }

        var qtables = rows[0].tablenames;
        var tableNames = qtables.split(/^\{(.*)\}$/)[1];
        tableNames = tableNames ? tableNames.split(',') : [];

        var lastUpdatedTime = rows[0].max || 0;

        callback(null, {
            affectedTables: tableNames,
            lastUpdatedTime: lastUpdatedTime * 1000
        });
    });
};

function sqlQuery(username, api_key, sql, callback) {
    var api = global.environment.sqlapi;

    // build up api string
    var sqlapihostname = username;
    if ( api.domain ) sqlapihostname += '.' + api.domain;

    var sqlapi = api.protocol + '://';
    if ( api.host && api.host != api.domain ) sqlapi += api.host;
    else sqlapi += sqlapihostname;
    sqlapi += ':' + api.port + '/api/' + api.version + '/sql';

    var qs  = { q: sql };

    // add api_key if given
    if (_.isString(api_key) && api_key != '') { qs.api_key = api_key; }

    // call sql api
    //
    // NOTE: using POST to avoid size limits:
    // See http://github.com/CartoDB/Windshaft-cartodb/issues/111
    //
    // NOTE: uses "host" header to allow IP based specification
    //       of sqlapi address (and avoid a DNS lookup)
    //
    // NOTE: allows for keeping up to "maxConnections" concurrent
    //       sockets opened per SQL-API host.
    // See http://nodejs.org/api/http.html#http_agent_maxsockets
    //
    var maxSockets = global.environment.maxConnections || 128;
    var maxGetLen = api.max_get_sql_length || 2048;
    var maxSQLTime = api.timeout || 100; // 1/10 of a second by default
    var reqSpec = {
        url:sqlapi,
        json:true,
        headers:{host: sqlapihostname}
        // http://nodejs.org/api/http.html#http_agent_maxsockets
        ,pool:{maxSockets:maxSockets}
        // timeout in milliseconds
        ,timeout:maxSQLTime
    };
    if ( sql.length > maxGetLen ) {
        reqSpec.method = 'POST';
        reqSpec.body = qs;
    } else {
        reqSpec.method = 'GET';
        reqSpec.qs = qs;
    }
    request(reqSpec, function(err, res, body) {
        if (err){
            console.log('ERROR connecting to SQL API on ' + sqlapi + ': ' + err);
            callback(err);
            return;
        }
        if (res.statusCode != 200) {
            var msg = res.body.error ? res.body.error : res.body;
            callback(new Error(msg));
            console.log('unexpected response status (' + res.statusCode + ') for sql query: ' + sql + ': ' + msg);
            return;
        }
        callback(null, body.rows);
    });
}