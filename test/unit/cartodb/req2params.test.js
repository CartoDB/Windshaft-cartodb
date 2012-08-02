var assert = require('assert')
  , _ = require('underscore')
  , redis = require('redis')
  , test_helper = require('../../support/test_helper')
  , tests = module.exports = {};

suite('req2params', function() {

    // configure redis pool instance to use in tests
    var opts = require('../../../lib/cartodb/server_options');
    
    test('can be found in server_options', function(){
      assert.ok(_.isFunction(opts.req2params));
    });

    test('cleans up request', function(done){
      opts.req2params({headers: { host:'h1' }, query: {dbuser:'hacker',dbname:'secret'}}, function(err, req) {
          if ( err ) { console.log(err); throw new Error(err); }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          assert.ok(_.isNull(req.params.dbname), 'could forge dbname');
          assert.ok(!req.params.hasOwnProperty('dbuser'), 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    test('sets dbname from redis metadata', function(done){
      opts.req2params({headers: { host:'vizzuality' }, query: {} }, function(err, req) {
          if ( err ) { console.log(err); throw new Error(err); }
          //console.dir(req);
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          // database_name for user "vizzuality" (see test/support/prepare_db.sh)
          assert.equal(req.params.dbname, 'cartodb_test_user_1_db');
          // unauthenticated request gets no dbuser
          assert.ok(!req.params.hasOwnProperty('dbuser'), 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    test('sets also dbuser for authenticated requests', function(done){
      opts.req2params({headers: { host:'vizzuality' }, query: {map_key: '1234'} }, function(err, req) {
          if ( err ) { console.log(err); throw new Error(err); }
          //console.dir(req);
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          // database_name for user "vizzuality" (see test/support/prepare_db.sh)
          assert.equal(req.params.dbname, 'cartodb_test_user_1_db');
          // id for user "vizzuality" (see test/support/prepare_db.sh)
          assert.equal(req.params.dbuser, 'test_cartodb_user_1');
 
          opts.req2params({headers: { host:'vizzuality' }, query: {map_key: '1235'} }, function(err, req) {
              // wrong key resets params to no user
              assert.ok(!req.params.hasOwnProperty('dbuser'), 'could inject dbuser ('+req.params.dbuser+')');
              done();
          });
      });
    });
    
});
