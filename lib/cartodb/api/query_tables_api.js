var sqlApi = require('../sql/sql_api');
var PSQL = require('cartodb-psql');
var Step = require('step');

function QueryTablesApi(pgConnection, metadataBackend) {
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
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

    this.runQuery(username, query, handleAffectedTablesInQueryRows, callback);
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

    this.runQuery(username, query, handleAffectedTablesAndLastUpdatedTimeRows, callback);
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


QueryTablesApi.prototype.runQuery = function(username, query, queryHandler, callback) {
    var self = this;

    if (shouldQueryPostgresDirectly()) {

        var params = {};

        Step(
            function setAuth() {
                self.pgConnection.setDBAuth(username, params, this);
            },
            function setConn(err) {
                if (err) {
                    throw err;
                }
                self.pgConnection.setDBConn(username, params, this);
            },
            function executeQuery(err) {
                if (err) {
                    throw err;
                }
                var psql = new PSQL({
                    user: params.dbuser,
                    pass: params.dbpass,
                    host: params.dbhost,
                    port: params.dbport,
                    dbname: params.dbname
                });
                psql.query(query, function(err, resultSet) {
                    resultSet = resultSet || {};
                    var rows = resultSet.rows || [];
                    queryHandler(err, rows, callback);
                });
            }
        );

    } else {

        Step(
            function getApiKey() {
                self.metadataBackend.getUserMapKey(username, this);
            },
            function executeQuery(err, apiKey) {
                if (err) {
                    throw err;
                }
                sqlApi.query(username, apiKey, query, function(err, rows) {
                    queryHandler(err, rows, callback);
                });
            }
        );

    }
};


function prepareSql(sql) {
    return sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.scale_denominator, '0')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;
}


function shouldQueryPostgresDirectly() {
    return global.environment &&
        global.environment.enabledFeatures &&
        global.environment.enabledFeatures.cdbQueryTablesFromPostgres;
}
