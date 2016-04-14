var PSQL = require('cartodb-psql');

function AnalysisBackend() {
}

module.exports = AnalysisBackend;


AnalysisBackend.prototype.getNodeStatus = function (params, callback) {
    var nodeId = params.nodeId;

    var statusQuery = 'SELECT node_id, status, updated_at FROM cdb_analysis_catalog where node_id = \'' + nodeId + '\'';

    var pg = new PSQL(dbParamsFromReqParams(params));
    pg.query(statusQuery, function(err, result) {
        if (err) {
            return callback(err, result);
        }

        result = result || {};

        var rows = result.rows || [];

        return callback(null, rows[0] || {
            node_id: nodeId,
            status: 'unknown'
        });
    }, true); // use read-only transaction
};

function dbParamsFromReqParams(params) {
    var dbParams = {};
    if ( params.dbuser ) {
        dbParams.user = params.dbuser;
    }
    if ( params.dbpassword ) {
        dbParams.pass = params.dbpassword;
    }
    if ( params.dbhost ) {
        dbParams.host = params.dbhost;
    }
    if ( params.dbport ) {
        dbParams.port = params.dbport;
    }
    if ( params.dbname ) {
        dbParams.dbname = params.dbname;
    }
    return dbParams;
}