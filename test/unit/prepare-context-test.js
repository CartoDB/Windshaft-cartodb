'use strict';

var assert = require('assert');
var _ = require('underscore');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var PgConnection = require('../../lib/backends/pg-connection');
var AuthBackend = require('../../lib/backends/auth');
var TemplateMaps = require('../../lib/backends/template-maps');
const MapStore = require('../support/map-store');

const cleanUpQueryParamsMiddleware = require('../../lib/api/middlewares/clean-up-query-params');
const authorizeMiddleware = require('../../lib/api/middlewares/authorize');
const dbConnSetupMiddleware = require('../../lib/api/middlewares/db-conn-setup');
const credentialsMiddleware = require('../../lib/api/middlewares/credentials');

describe('prepare-context', function () {
    var testUser = _.template(global.environment.postgres_auth_user, { user_id: 1 });
    var testPubuser = global.environment.postgres.user;
    var testDatabase = testUser + '_db';

    let cleanUpQueryParams;
    let dbConnSetup;
    let authorize;
    let setCredentials;

    before(function () {
        var redisPool = new RedisPool(global.environment.redis);
        var mapStore = new MapStore(redisPool);
        var metadataBackend = cartodbRedis({ pool: redisPool });
        var pgConnection = new PgConnection(metadataBackend);
        var templateMaps = new TemplateMaps(redisPool);
        var authBackend = new AuthBackend(pgConnection, metadataBackend, mapStore, templateMaps);

        cleanUpQueryParams = cleanUpQueryParamsMiddleware();
        authorize = authorizeMiddleware(authBackend);
        dbConnSetup = dbConnSetupMiddleware(pgConnection);
        setCredentials = credentialsMiddleware();
    });

    it('can be found in server-options', function () {
        assert.ok(_.isFunction(authorize));
        assert.ok(_.isFunction(dbConnSetup));
        assert.ok(_.isFunction(cleanUpQueryParams));
    });

    function prepareRequest (req) {
        req.profiler = {
            done: function () {}
        };

        return req;
    }

    function prepareResponse (res) {
        if (!res.locals) {
            res.locals = {};
        }
        res.locals.user = 'localhost';

        res.set = function () {};

        return res;
    }

    it('cleans up request', function (done) {
        var req = { headers: { host: 'localhost' }, query: { dbuser: 'hacker', dbname: 'secret' } };
        var res = {};

        cleanUpQueryParams(prepareRequest(req), prepareResponse(res), function (err) {
            if (err) { done(err); return; }
            assert.ok(_.isObject(req.query), 'request has query');
            assert.ok(!Object.prototype.hasOwnProperty.call(req.query, 'dbuser'), 'dbuser was removed from query');
            assert.ok(Object.prototype.hasOwnProperty.call(res, 'locals'), 'response has locals');
            assert.ok(!Object.prototype.hasOwnProperty.call(res.locals, 'interactivity'), 'response locals do not have interactivity');
            done();
        });
    });

    it('sets dbname from redis metadata', function (done) {
        var req = { headers: { host: 'localhost' }, query: {} };
        var res = { set: function () {} };

        dbConnSetup(prepareRequest(req), prepareResponse(res), function (err) {
            if (err) { done(err); return; }
            assert.ok(_.isObject(req.query), 'request has query');
            assert.ok(!Object.prototype.hasOwnProperty.call(req.query, 'dbuser'), 'dbuser was removed from query');
            assert.ok(Object.prototype.hasOwnProperty.call(res, 'locals'), 'response has locals');
            assert.ok(!Object.prototype.hasOwnProperty.call(res.locals, 'interactivity'), 'response locals do not have interactivity');
            assert.strictEqual(res.locals.dbname, testDatabase);
            assert.ok(res.locals.dbuser === testPubuser, 'could inject dbuser (' + res.locals.dbuser + ')');
            done();
        });
    });

    it('sets also dbuser for authenticated requests', function (done) {
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
            dbConnSetup(req, res, function (err) {
                if (err) { done(err); return; }
                assert.ok(_.isObject(req.query), 'request has query');
                assert.ok(!Object.prototype.hasOwnProperty.call(req.query, 'dbuser'), 'dbuser was removed from query');
                assert.ok(Object.prototype.hasOwnProperty.call(res, 'locals'), 'response has locals');
                assert.ok(!Object.prototype.hasOwnProperty.call(res.locals, 'interactivity'), 'request params do not have interactivity');
                assert.strictEqual(res.locals.dbname, testDatabase);
                assert.strictEqual(res.locals.dbuser, testUser);

                req = {
                    headers: {
                        host: 'localhost'
                    },
                    query: {
                        map_key: '1235'
                    }
                };

                res = { set: function () {} };

                dbConnSetup(prepareRequest(req), prepareResponse(res), function () {
                    // wrong key resets params to no user
                    assert.ok(res.locals.dbuser === testPubuser, 'could inject dbuser (' + res.locals.dbuser + ')');
                    done();
                });
            });
        });
    });

    it('it should remove invalid params', function (done) {
        var config = {
            version: '1.3.0'
        };
        var req = {
            headers: {
                host: 'localhost'
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
            if (err) {
                return done(err);
            }

            assert.deepStrictEqual(config, req.query.config);
            assert.strictEqual('test', req.query.api_key);
            assert.strictEqual(undefined, req.query.non_included);
            done();
        });
    });

    describe('Set apikey token', function () {
        it('from query param', function (done) {
            var req = {
                headers: {
                    host: 'localhost'
                },
                query: {
                    api_key: '1234'
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.strictEqual('1234', query.api_key);
                done();
            });
        });

        it('from body param', function (done) {
            var req = {
                headers: {
                    host: 'localhost'
                },
                body: {
                    api_key: '1234'
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.strictEqual('1234', query.api_key);
                done();
            });
        });

        it('from http header', function (done) {
            var req = {
                headers: {
                    host: 'localhost',
                    authorization: 'Basic bG9jYWxob3N0OjEyMzQ=' // user: localhost, password: 1234
                }
            };
            var res = {};
            setCredentials(prepareRequest(req), prepareResponse(res), function (err) {
                if (err) {
                    return done(err);
                }
                var query = res.locals;

                assert.strictEqual('1234', query.api_key);
                done();
            });
        });
    });
});
