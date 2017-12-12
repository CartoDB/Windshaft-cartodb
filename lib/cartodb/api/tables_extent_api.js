function TablesExtentApi(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = TablesExtentApi;

/**
 * Given a username and a list of tables it will return the estimated extent in SRID 4326 for all the tables based on
 * the_geom_webmercator (SRID 3857) column.
 *
 * @param {String} username
 * @param {Array} tableNames The named can be schema qualified, so this accepts both `schema_name.table_name` and
 *  `table_name` format as valid input
 * @param {Function} callback function(err, result) {Object} result with `west`, `south`, `east`, `north`
 */
TablesExtentApi.prototype.getBounds = function (dbConnnection, tables, callback) {
    var estimatedExtentSQLs = tables.map(function(table) {
        return "ST_EstimatedExtent('" + table.schema_name + "', '" + table.table_name + "', 'the_geom_webmercator')";
    });

    var query = [
        "WITH ext as (" +
            "SELECT ST_Transform(ST_SetSRID(ST_Extent(ST_Union(ARRAY[",
                estimatedExtentSQLs.join(','),
            "])), 3857), 4326) geom)",
        "SELECT",
            "ST_XMin(geom) west,",
            "ST_YMin(geom) south,",
            "ST_XMax(geom) east,",
            "ST_YMax(geom) north",
        "FROM ext"
    ].join(' ');

    this.pgQueryRunner.run(dbConnnection, query, function handleBoundsResult (err, rows) {
        if (err) {
            var msg = err.message ? err.message : err;
            return callback(new Error('could not fetch source tables: ' + msg));
        }
        var result = null;
        if (rows.length > 0) {
            result = {
                bounds: rows[0]
            };
        }
        callback(null, result);
    });
};
