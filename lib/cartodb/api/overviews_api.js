var queue = require('queue-async');
var QueryTablesApi = require('./query_tables_api');

function OverviewsApi(pgQueryRunner) {
   if (pgQueryRunner.pgQueryRunner != null) {
       this.queryTablesApi = pgQueryRunner;
       this.pgQueryRunner = this.queryTablesApi.pgQueryRunner;
   } else {
       this.pgQueryRunner = pgQueryRunner;
       this.queryTablesApi = new QueryTablesApi(pgQueryRunner);
  }
}

module.exports = OverviewsApi;

OverviewsApi.prototype.getOverviewsMetadata = function (username, sql, callback) {
    this.queryTablesApi.getAffectedTablesInQuery(username, sql, function(err, tableNames){
        if (err) {
            callback(err);
        } else {
            var metadata = {};

            var parallelism = 2;
            var q = queue(parallelism);

            for ( var i=0; i < tableNames.length; ++i ) {
                q.defer(function(tableName, done){
                    var query = "SELECT * FROM CDB_Overviews('" + tableName + "');";
                    this.pgQueryRunner.run(username, query, handleOverviewsRows, function(err, table_metadata){
                        if (err) {
                            done(err);
                        } else {
                            metadata[tableName] = table_metadata;
                            done(null);
                        }
                    });
                }, tableNames[i]);
            }

            q.awaitAll(function(err){
              if (err) {
                  return callback(err);
              } else {
                  return callback(null, metadata);
              }
            });
        };
    });
};

function handleOverviewsRows(err, rows, callback) {
    if (err){
        var msg = err.message ? err.message : err;
        callback(new Error('could not get overviews metadata: ' + msg));
        return;
    }
    var metadata = {};
    for ( var i=0; i<rows.length; ++i ) {
      var row = rows[i];
      metadata[row.z] = { table: row.overview_table };
    };
    callback(null, metadata);
}
