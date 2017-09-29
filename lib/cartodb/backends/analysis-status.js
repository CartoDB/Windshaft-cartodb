var PSQL = require('cartodb-psql');

function AnalysisStatusBackend() {
}

module.exports = AnalysisStatusBackend;


AnalysisStatusBackend.prototype.getNodeStatus = function (nodeId, params, callback) {
    var statusQuery = [
        'SELECT node_id, status, updated_at, last_error_message as error_message',
        'FROM cdb_analysis_catalog where node_id = \'' + nodeId + '\''
    ].join(' ');

    var pg = new PSQL(dbParamsFromReqParams(params));
    pg.query(statusQuery, function(err, result) {
        if (err) {
            return callback(err, result);
        }

        result = result || {};

        var rows = result.rows || [];

        var statusResponse = rows[0] || {
            node_id: nodeId,
            status: 'unknown'
        };

        if (statusResponse.status !== 'failed') {
            delete statusResponse.error_message;
        }

        return callback(null, statusResponse);
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
