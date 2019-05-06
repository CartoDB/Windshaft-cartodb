'use strict';

var assert = require('assert');
var _ = require('underscore');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var PgConnection = require('../../../lib/cartodb/backends/pg_connection');
var AuthBackend = require('../../../lib/cartodb/backends/auth');
var TemplateMaps = require('../../../lib/cartodb/backends/template_maps');

const cleanUpQueryParamsMiddleware = require('../../../lib/cartodb/api/middlewares/clean-up-query-params');
const authorizeMiddleware = require('../../../lib/cartodb/api/middlewares/authorize');
const dbConnSetupMiddleware = require('../../../lib/cartodb/api/middlewares/db-conn-setup');
const credentialsMiddleware = require('../../../lib/cartodb/api/middlewares/credentials');

var windshaft = require('windshaft');

describe('prepare-context', function() {

    var test_user = _.template(global.environment.postgres_auth_user, {user_id:1});
    var test_pubuser = global.environment.postgres.user;
    var test_database = test_user + '_db';

    let cleanUpQueryParams;
    let dbConnSetup;
    let authorize;
    let setCredentials;

    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var mapStore = new windshaft.storage.MapStore();
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        var templateMaps = new TemplateMaps(redisPool);
        var authBackend = new AuthBackend(pgConnection, metadataBackend, mapStore, templateMaps);

        cleanUpQueryParams = cleanUpQueryParamsMiddleware();
        authorize = authorizeMiddleware(authBackend);
        dbConnSetup = dbConnSetupMiddleware(pgConnection);
        setCredentials = credentialsMiddleware();
    });


    it('can be found in server_options', function(){
        assert.ok(_.isFunction(authorize));
        assert.ok(_.isFunction(dbConnSetup));
        assert.ok(_.isFunction(cleanUpQueryParams));
    });

    function prepareRequest(req) {
        req.profiler = {
            done: function() {}
        };

        return req;
    }

    function prepareResponse(res) {
        if(!res.locals) {
            res.locals = {};
        }
        res.locals.user = 'localhost';

        res.set = function () {};

        return res;
    }

    it('cleans up request', function(done){
      var req = {headers: { host:'localhost' }, query: {dbuser:'hacker',dbname:'secret'}};
      var res = {};

      cleanUpQueryParams(prepareRequest(req), prepareResponse(res), function(err) {
          if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(res.hasOwnProperty('locals'), 'response has locals');
          assert.ok(!res.locals.hasOwnProperty('interactivity'), 'response locals do not have interactivity');
          done();
      });
    });

    it('sets dbname from redis metadata', function(done){
      var req = {headers: { host:'localhost' }, query: {} };
      var res = { set: function () {} };

      dbConnSetup(prepareRequest(req), prepareResponse(res), function(err) {
        if ( err ) { done(err); return; }
          assert.ok(_.isObject(req.query), 'request has query');
          assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
          assert.ok(res.hasOwnProperty('locals'), 'response has locals');
          assert.ok(!res.locals.hasOwnProperty('interactivity'), 'response locals do not have interactivity');
          assert.equal(res.locals.dbname, test_database);
          assert.ok(res.locals.dbuser === test_pubuser, 'could inject dbuser ('+res.locals.dbuser+')');
          done();
      });
    });

    it('sets also dbuser for authenticated requests', function(done){
        var req = {
            headers: {
                host: 'localhost'
            },
            query: {
                api_key: '1234'
            }
        };
        var res = {
            set: function () {},
            locals: {
                api_key: '1234'
            }
        };

        // FIXME: review authorize-pgconnsetup workflow, It might we are doing authorization twice.
        authorize(prepareRequest(req), prepareResponse(res), function (err) {
            if (err) { done(err); return; }
            dbConnSetup(req, res, function(err) {
                if ( err ) { done(err); return; }
                assert.ok(_.isObject(req.query), 'request has query');
                assert.ok(!req.query.hasOwnProperty('dbuser'), 'dbuser was removed from query');
                assert.ok(res.hasOwnProperty('locals'), 'response has locals');
                assert.ok(!res.locals.hasOwnProperty('interactivity'), 'request params do not have interactivity');
                assert.equal(res.locals.dbname, test_database);
                assert.equal(res.locals.dbuser, test_user);

                req = {
                    headers: {
                        host:'localhost'
                    },
                    query: {
                        map_key: '1235'
                    }
                };

                res = { set: function () {} };

                dbConnSetup(prepareRequest(req), prepareResponse(res), function() {
                    // wrong key resets params to no user
                    assert.ok(res.locals.dbuser === test_pubuser, 'could inject dbuser ('+res.locals.dbuser+')');
                    done();
                });
            });
        });
    });

    it('it should remove invalid params', function(done) {
        var config = {
            version: '1.3.0'
        };
        var req = {
            headers: {
                host:'localhost'
            },
            query: {
                non_included: 'toberemoved',
                api_key: 'test',
                style: 'override',
                config: config
            }
        };
        var res = {};

        cleanUpQueryParams(prepareRequest(req), prepareResponse(res), function (err) {
            if ( err ) {
                return done(err);
            }

            assert.deepEqual(config, req.query.config);
            assert.equal('test', req.query.api_key);
            assert.equal(undefined, req.query.non_included);
            done();
        });
    });

    describe('Set apikey token', function(){
        it('from query param', function (done) {
            var req = {
                headers: {
                    host: 'localhost'
                },
                query: {
                    api_key: '1234',
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.equal('1234', query.api_key);
                done();
            });
        });

        it('from body param', function (done) {
            var req = {
                headers: {
                    host: 'localhost'
                },
                body: {
                    api_key: '1234',
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.equal('1234', query.api_key);
                done();
            });
        });

        it('from http header', function (done) {
            var req = {
                headers: {
                    host: 'localhost',
                    authorization: 'Basic bG9jYWxob3N0OjEyMzQ=', // user: localhost, password: 1234
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.equal('1234', query.api_key);
                done();
            });
        });
    });
});
