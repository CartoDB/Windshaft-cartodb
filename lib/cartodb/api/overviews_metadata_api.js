function OverviewsMetadataApi(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = OverviewsMetadataApi;

// TODO: share this with QueryTablesApi? ... or maintain independence?
var affectedTableRegexCache = {
    bbox: /!bbox!/g,
    scale_denominator: /!scale_denominator!/g,
    pixel_width: /!pixel_width!/g,
    pixel_height: /!pixel_height!/g
};

function prepareSql(sql) {
    return sql
        .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
        .replace(affectedTableRegexCache.scale_denominator, '0')
        .replace(affectedTableRegexCache.pixel_width, '1')
        .replace(affectedTableRegexCache.pixel_height, '1')
    ;
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
            var table_metadata = metadata[table];
            if ( !table_metadata ) {
                table_metadata = metadata[table] = {};
            }
            table_metadata[row.z] = { table: row.overview_table };
            table_metadata.schema = schema;
            return metadata;
        }, {});
        return callback(null, metadata);
    });
};
