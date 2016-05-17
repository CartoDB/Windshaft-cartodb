var _ = require('underscore');
var step = require('step');
var CamshaftFilter = require('../models/filter/camshaft');

function FilterStatsApi(pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = FilterStatsApi;

function getEstimatedRows(pgQueryRunner, username, query, callback) {
    pgQueryRunner.run(username, "EXPLAIN "+query, function(err, result_rows) {
        if (err){
            callback(err);
            return;
        }
        var rows;
        var query_plan = result_rows[0]['QUERY PLAN'];
        var match;
        if ( query_plan ) {
            match = query_plan.match(/rows=(\d+)/);
        }
        if ( match ) {
          rows = +match[1];
        }
        return callback(null, rows);
    });
}

FilterStatsApi.prototype.getFilterStats = function (username, unfiltered_query, filters, callback) {
  var stats = {};
  var self = this;
  step(
      function getUnfilteredRows() {
          getEstimatedRows(self.pgQueryRunner, username, unfiltered_query, this);
      },
      function receiveUnfilteredRows(err, rows) {
          if (err){
              callback(err);
              return;
          }
          stats.unfiltered_rows = rows;
          this(null, rows);
      },
      function getFilteredRows() {
          if ( filters && !_.isEmpty(filters)) {
              var camshaftFilter = new CamshaftFilter(filters);
              var query = camshaftFilter.sql(unfiltered_query);
              getEstimatedRows(self.pgQueryRunner, username, query, this);
          } else {
              this(null, null);
          }
      },
      function receiveFilteredRows(err, rows) {
          if (err){
              callback(err);
              return;
          }
          stats.filtered_rows = rows;
          callback(null, stats);
      }
  );
};
