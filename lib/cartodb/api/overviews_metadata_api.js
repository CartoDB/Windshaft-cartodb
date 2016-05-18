var SubstitutionTokens = require('../utils/substitution-tokens');

function OverviewsMetadataApi(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = OverviewsMetadataApi;

function prepareSql(sql) {
    return sql && SubstitutionTokens.replace(sql, {
        bbox: 'ST_MakeEnvelope(0,0,0,0)',
        scale_denominator: '0',
        pixel_width: '1',
        pixel_height: '1'
    });
}

OverviewsMetadataApi.prototype.getOverviewsMetadata = function (username, sql, callback) {
    // FIXME: Currently using internal function _cdb_schema_name
    //        CDB_Overviews should provide the schema information directly.
    var query = 'SELECT *, _cdb_schema_name(base_table)' +
                '  FROM CDB_Overviews(CDB_QueryTablesText($windshaft$' + prepareSql(sql) + '$windshaft$))';
    this.pgQueryRunner.run(username, query, function handleOverviewsRows(err, rows) {
        if (err){
            callback(err);
            return;
        }
        var metadata = rows.reduce(function(metadata, row){
            var table = row.base_table;
            var schema = row._cdb_schema_name;
            if ( !metadata[table] ) {
                metadata[table] = {};
            }
            metadata[table][row.z] = { table: row.overview_table };
            metadata[table].schema = schema;
            return metadata;
        }, {});
        return callback(null, metadata);
    });
};
