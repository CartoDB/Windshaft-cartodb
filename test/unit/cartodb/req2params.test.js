var assert = require('assert');
var _ = require('underscore');
var test_helper = require('../../support/test_helper');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var PgConnection = require('../../../lib/cartodb/backends/pg_connection');
var AuthApi = require('../../../lib/cartodb/api/auth_api');
var TemplateMaps = require('../../../lib/cartodb/backends/template_maps');

var BaseController = require('../../../lib/cartodb/controllers/base');
var windshaft = require('windshaft');

describe('req2params', function() {

    var test_user = _.template(global.environment.postgres_auth_user, {user_id:1});
    var test_pubuser = global.environment.postgres.user;
    var test_database = test_user + '_db';


    var baseController;
    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var mapStore = new windshaft.storage.MapStore();
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        var templateMaps = new TemplateMaps(redisPool);
        var authApi = new AuthApi(pgConnection, metadataBackend, mapStore, templateMaps);

        baseController = new BaseController(authApi, pgConnection);
    });


    it('can be found in server_options', function(){
      assert.ok(_.isFunction(baseController.req2params));
    });

    function prepareRequest(req) {
        req.profiler = {
            done: function() {}
        };
        req.context = { user: 'localhost' };
        return req;
    }

    it('cleans up request', function(done){
      var req = {headers: { host:'localhost' }, query: {dbuser:'hacker',dbname:'secret'}};
      baseController.req2params(prepareRequest(req), function(err, req) {
          if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(!req.params.hasOwnProperty('interactivity'), 'request params do not have interactivity');
          assert.equal(req.params.dbname, test_database, 'could forge dbname: '+ req.params.dbname);
          assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    it('sets dbname from redis metadata', function(done){
      var req = {headers: { host:'localhost' }, query: {} };
      baseController.req2params(prepareRequest(req), function(err, req) {
          if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(!req.params.hasOwnProperty('interactivity'), 'request params do not have interactivity');
          assert.equal(req.params.dbname, test_database);
          assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
          done();
      });
    });

    it('sets also dbuser for authenticated requests', function(done){
      var req = {headers: { host:'localhost' }, query: {map_key: '1234'} };
      baseController.req2params(prepareRequest(req), function(err, req) {
          if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(req.hasOwnProperty('params'), 'request has params');
          assert.ok(!req.params.hasOwnProperty('interactivity'), 'request params do not have interactivity');
          assert.equal(req.params.dbname, test_database);
          assert.equal(req.params.dbuser, test_user);

          req = {
              headers: {
                  host:'localhost'
              },
              query: {
                  map_key: '1235'
              }
          };
          baseController.req2params(prepareRequest(req), function(err, req) {
              // wrong key resets params to no user
              assert.ok(req.params.dbuser === test_pubuser, 'could inject dbuser ('+req.params.dbuser+')');
              done();
          });
      });
    });

    it('it should extend params with decoded lzma', function(done) {
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
            baseController.req2params(prepareRequest(req), function(err, req) {
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
