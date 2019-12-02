'use strict';

var PSQL = require('cartodb-psql');

function AnalysisStatusBackend () {
}

module.exports = AnalysisStatusBackend;

AnalysisStatusBackend.prototype.getNodeStatus = function (nodeId, dbParams, callback) {
    var statusQuery = [
        'SELECT node_id, status, updated_at, last_error_message as error_message',
        'FROM cartodb.cdb_analysis_catalog where node_id = \'' + nodeId + '\''
    ].join(' ');

    var pg = new PSQL(dbParams);

    pg.query(statusQuery, function (err, result) {
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
