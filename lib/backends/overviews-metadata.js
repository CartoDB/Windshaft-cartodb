'use strict';

const queryUtils = require('../utils/query-utils');

function OverviewsMetadataBackend (pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = OverviewsMetadataBackend;

OverviewsMetadataBackend.prototype.getOverviewsMetadata = function (username, sql, callback) {
    // FIXME: Currently using internal function _cdb_schema_name
    //        CDB_Overviews should provide the schema information directly.
    const query = `
      SELECT *, cartodb._cdb_schema_name(base_table)
        FROM cartodb.CDB_Overviews(
            cartodb.CDB_QueryTablesText($windshaft$${queryUtils.substituteDummyTokens(sql)}$windshaft$)
        );
    `;
    this.pgQueryRunner.run(username, query, function handleOverviewsRows (err, rows) {
        if (err) {
            callback(err);
            return;
        }
        var metadata = rows.reduce(function (metadata, row) {
            var table = row.base_table;
            var schema = row._cdb_schema_name;
            if (!metadata[table]) {
                metadata[table] = {};
            }
            metadata[table][row.z] = { table: row.overview_table };
            metadata[table].schema = schema;
            return metadata;
        }, {});
        return callback(null, metadata);
    });
};
