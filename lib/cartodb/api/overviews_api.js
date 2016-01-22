var queue = require('queue-async');
var QueryTablesApi = require('./query_tables_api');

function OverviewsApi(pgQueryRunner) {
   if (pgQueryRunner.pgQueryRunner !== undefined) {
       this.queryTablesApi = pgQueryRunner;
       this.pgQueryRunner = this.queryTablesApi.pgQueryRunner;
   } else {
       this.pgQueryRunner = pgQueryRunner;
       this.queryTablesApi = new QueryTablesApi(pgQueryRunner);
  }
}

module.exports = OverviewsApi;

OverviewsApi.prototype.getOverviewsMetadata = function (username, sql, callback) {
    var self = this;
    this.queryTablesApi.getAffectedTablesInQuery(username, sql, function(err, tableNames){
        if (err) {
            callback(err);
        } else {
            var parallelism = 2;
            var q = queue(parallelism);

            tableNames.forEach(function(tableName) {
                q.defer(function(done){
                    var query = "SELECT * FROM CDB_Overviews('" + tableName + "');";
                    self.pgQueryRunner.run(username, query, function handleOverviewsRows(err, rows) {
                        if (err){
                            var msg = err.message ? err.message : err;
                            done(new Error('could not get overviews metadata: ' + msg));
                            return;
                        }
                        done(null, [tableName, rows]);
                    });
                });
            });

            var metadata = {};
            q.awaitAll(function(err, results){
              if (err) {
                  return callback(err);
              } else {
                  results.forEach(function(table_rows) {
                      var tableName = table_rows[0];
                      var rows = table_rows[1];
                      if ( rows.length > 0 ) {
                          var table_metadata = {};
                          for ( var i=0; i<rows.length; ++i ) {
                              var row = rows[i];
                              table_metadata[row.z] = { table: row.overview_table };
                          }
                          metadata[tableName] = table_metadata;
                      }
                  });
                  return callback(null, metadata);
              }
            });
        }
    });
};
