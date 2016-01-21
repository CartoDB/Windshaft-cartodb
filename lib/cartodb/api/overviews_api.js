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
            var metadata = {};

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
                        if ( rows.length > 0 ) {
                          var table_metadata = {};
                          for ( var i=0; i<rows.length; ++i ) {
                            var row = rows[i];
                            table_metadata[row.z] = { table: row.overview_table };
                          }
                          metadata[tableName] = table_metadata;
                        }
                        done(null);
                    });
                });
            });

            q.awaitAll(function(err){
              if (err) {
                  return callback(err);
              } else {
                  return callback(null, metadata);
              }
            });
        }
    });
};
