function AnalysisStatusBackend({ pgConnection }) {
    this.pgConnection = pgConnection;
}

module.exports = AnalysisStatusBackend;

AnalysisStatusBackend.prototype.getNodeStatus = function (params, callback) {
    var nodeId = params.nodeId;

    var statusQuery = [
        'SELECT node_id, status, updated_at, last_error_message as error_message',
        'FROM cdb_analysis_catalog where node_id = \'' + nodeId + '\''
    ].join(' ');

    const dbConnection = this.pgConnection.getMasterConnection(params.db);
    
    dbConnection.query(statusQuery, function(err, result) {
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
