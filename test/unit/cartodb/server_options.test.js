var assert = require('assert')
  , _ = require('underscore')
  , redis = require('redis')
  , test_helper = require('../../support/test_helper')
  , tests = module.exports = {};

suite('server_options', function(){
    var opts = require('../../../lib/cartodb/server_options')();
    
    it('uses db slaves if there are any', function(done){
      var params_array = [];
      var servers = ['127.0.0.1','localhost'];
      var counter = 15*servers.length;
      var callback = function(err, options) {
        counter = counter-1;
        if(counter==0) {
         var unique_params = _.uniq(params_array, false, function(a){return a.dbhost});
         var unique_dbhosts = _.pluck(unique_params,'dbhost');
         assert.deepEqual(unique_dbhosts.sort(), servers.sort());
         done();
        }
      }
      for(i=0; i<15*servers.length; i++) {
          params_array[i] = {};
          opts.setDBConn('cartodb250user',params_array[i],callback)
      }

    });
    it('always returns the same database_host for a db with no slaves', function(done){
      var params_array = [];
      var servers = ['127.0.0.1'];
      var counter = 15*servers.length;
      var callback = function(err, options) {
        counter = counter-1;
        if(counter==0) {
         var unique_params = _.uniq(params_array, false, function(a){return a.dbhost});
         var unique_dbhosts = _.pluck(unique_params,'dbhost');
         assert.deepEqual(unique_dbhosts.sort(), servers.sort());
         done();
        }
      }
      for(i=0; i<15*servers.length; i++) {
          params_array[i] = {};
          opts.setDBConn('localhost',params_array[i],callback)
      }

    });
});
