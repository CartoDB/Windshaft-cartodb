'use strict';

const queryUtils = require('../utils/query-utils');

module.exports = class OverviewsMetadataBackend {
    constructor (pgQueryRunner) {
        this._pgQueryRunner = pgQueryRunner;
    }

    getOverviewsMetadata (username, sql, callback) {
        // FIXME: Currently using internal function _cdb_schema_name
        //        CDB_Overviews should provide the schema information directly.
        const query = `
          SELECT *, cartodb._cdb_schema_name(base_table)
            FROM cartodb.CDB_Overviews(
                cartodb.CDB_QueryTablesText($windshaft$${queryUtils.substituteDummyTokens(sql)}$windshaft$)
            );
        `;

        this._pgQueryRunner.run(username, query, (err, rows) => {
            if (err) {
                return callback(err);
            }

            const metadata = rows.reduce((metadata, row) => {
                const table = row.base_table;
                const schema = row._cdb_schema_name;

                if (!metadata[table]) {
                    metadata[table] = {};
                }

                metadata[table][row.z] = { table: row.overview_table };
                metadata[table].schema = schema;

                return metadata;
            }, {});

            return callback(null, metadata);
        });
    }
};
