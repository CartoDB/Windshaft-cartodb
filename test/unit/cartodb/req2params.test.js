var assert = require('assert');
var _ = require('underscore');
var test_helper = require('../../support/test_helper');

suite('req2params', function() {

    // configure redis pool instance to use in tests
    var opts = require('../../../lib/cartodb/server_options')();

    var test_user = _.template(global.environment.postgres_auth_user, {user_id:1});
    var test_pubuser = global.environment.postgres.user;
    var test_database = test_user + '_db';

    
    test('can be found in server_options', function(){
      assert.ok(_.isFunction(opts.req2params));
    });

    test('cleans up request', function(done){
      opts.req2params({headers: { host:'localhost' }, query: {dbuser:'hacker',dbname:'secret'}}, function(err, req) {
          if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          assert.equal(req.params.dbname, test_database, 'could forge dbname: '+ req.params.dbname);
          assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    test('sets dbname from redis metadata', function(done){
      opts.req2params({headers: { host:'localhost' }, query: {} }, function(err, req) {
          if ( err ) { done(err); return; }
          //console.dir(req);
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          assert.equal(req.params.dbname, test_database);
          assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    test('sets also dbuser for authenticated requests', function(done){
      opts.req2params({headers: { host:'localhost' }, query: {map_key: '1234'} }, function(err, req) {
          if ( err ) { done(err); return; }
          //console.dir(req);
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(req.params.hasOwnProperty('interactivity'), 'request params have interactivity');
          assert.equal(req.params.dbname, test_database);
          assert.equal(req.params.dbuser, test_user);
 
          opts.req2params({headers: { host:'localhost' }, query: {map_key: '1235'} }, function(err, req) {
              // wrong key resets params to no user
              assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
              done();
          });
      });
    });

    test('it should extend params with decoded lzma', function(done) {
        var qo = {
            config: {
                version: '1.3.0'
            }
        };
        test_helper.lzma_compress_to_base64(JSON.stringify(qo), 1, function(err, data) {
            var req = {
                headers: {
                    host:'localhost'
                },
                query: {
                    non_included: 'toberemoved',
                    api_key: 'test',
                    style: 'override',
                    lzma: data
                }
            };
            opts.req2params(req, function(err, req) {
                if ( err ) {
                    return done(err);
                }
                var query = req.params;
                assert.deepEqual(qo.config, query.config);
                assert.equal('test', query.api_key);
                assert.equal(undefined, query.non_included);
                done();
            });
        });
    });

});
