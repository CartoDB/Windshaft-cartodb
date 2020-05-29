'use strict';

const PSQL = require('cartodb-psql');

module.exports = class AnalysisStatusBackend {
    getNodeStatus (nodeId, dbParams, callback) {
        const statusQuery = [
            'SELECT node_id, status, updated_at, last_error_message as error_message',
            `FROM cartodb.cdb_analysis_catalog where node_id = '${nodeId}'`
        ].join(' ');

        const pg = new PSQL(dbParams);
        const readOnlyTransaction = true;

        pg.query(statusQuery, (err, result) => {
            if (err) {
                return callback(err, result);
            }

            result = result || {};

            const rows = result.rows || [];
            const statusResponse = rows[0] || {
                node_id: nodeId,
                status: 'unknown'
            };

            if (statusResponse.status !== 'failed') {
                delete statusResponse.error_message;
            }

            return callback(null, statusResponse);
        }, readOnlyTransaction);
    }
};
