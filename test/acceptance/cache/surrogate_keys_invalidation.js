var assert      = require('../../support/assert');
var redis       = require('redis');
var Step        = require('step');

var helper = require(__dirname + '/../../support/test_helper');

var SqlApiEmulator = require(__dirname + '/../../support/SQLAPIEmu.js');

var NamedMapsCacheEntry = require(__dirname + '/../../../lib/cartodb/cache/model/named_maps_entry');
var SurrogateKeysCache = require(__dirname + '/../../../lib/cartodb/cache/surrogate_keys_cache');

var CartodbWindshaft = require(__dirname + '/../../../lib/cartodb/cartodb_windshaft');
var ServerOptions = require(__dirname + '/../../../lib/cartodb/server_options');
var serverOptions = ServerOptions();


suite('templates surrogate keys', function() {

    var sqlApiServer;
    var redisClient = redis.createClient(global.environment.redis.port);

    // Enable Varnish purge for tests
    serverOptions.varnish_purge_enabled = true;

    var server = new CartodbWindshaft(serverOptions);

    var templateOwner = 'localhost',
        templateName = 'acceptance',
        expectedTemplateId = templateOwner + '@' + templateName,
        template = {
            version: '0.0.1',
            name: templateName,
            auth: {
                method: 'open'
            },
            layergroup:  {
                version: '1.2.0',
                layers: [
                    {
                        options: {
                            sql: 'select 1 cartodb_id, null::geometry as the_geom_webmercator',
                            cartocss: '#layer { marker-fill:blue; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        },
        expectedBody = { template_id: expectedTemplateId };

    suiteSetup(function(done) {
        sqlApiServer = new SqlApiEmulator(global.environment.sqlapi.port, done);
    });

    var surrogateKeysCacheInvalidateFn = SurrogateKeysCache.prototype.invalidate;

    function createTemplate(callback) {
        var postTemplateRequest = {
            url: '/api/v1/map/named?api_key=1234',
            method: 'POST',
            headers: {
                host: templateOwner,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(template)
        };

        Step(
            function postTemplate() {
                var next = this;
                assert.response(server,
                    postTemplateRequest,
                    {
                        status: 200
                    },
                    function(res) {
                        next(null, res);
                    }
                );
            },
            function rePostTemplate(err, res) {
                if (err) {
                    throw err;
                }
                var parsedBody = JSON.parse(res.body);
                assert.deepEqual(parsedBody, expectedBody);
                return true;
            },
            function finish(err) {
                callback(err);
            }
        );
    }

    test("update template calls surrogate keys invalidation", function(done) {
        var cacheEntryKey;
        var surrogateKeysCacheInvalidateMethodInvoked = false;
        SurrogateKeysCache.prototype.invalidate = function(cacheEntry) {
            cacheEntryKey = cacheEntry.key();
            surrogateKeysCacheInvalidateMethodInvoked = true;
        };

        Step(
            function createTemplateToUpdate() {
                createTemplate(this);
            },
            function putValidTemplate(err) {
                if (err) {
                    throw err;
                }
                var updateTemplateRequest = {
                    url: '/api/v1/map/named/' + expectedTemplateId + '/?api_key=1234',
                    method: 'PUT',
                    headers: {
                        host: templateOwner,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(template)
                };
                var next = this;
                assert.response(server,
                    updateTemplateRequest,
                    {
                        status: 200
                    },
                    function(res) {
                        next(null, res);
                    }
                );
            },
            function checkValidUpdate(err, res) {
                if (err) {
                    throw err;
                }
                var parsedBody = JSON.parse(res.body);
                assert.deepEqual(parsedBody, expectedBody);

                assert.ok(surrogateKeysCacheInvalidateMethodInvoked);
                assert.equal(cacheEntryKey, new NamedMapsCacheEntry(templateOwner, templateName).key());

                return null;
            },
            function finish(err) {
                if ( err ) {
                    return done(err);
                }
                redisClient.keys("map_*|localhost", function(err, keys) {
                    if ( err ) {
                        return done(err);
                    }
                    redisClient.del(keys, function(err) {
                        return done(err);
                    });
                });
            }
        );
    });

    test("delete template calls surrogate keys invalidation", function(done) {

        var cacheEntryKey;
        var surrogateKeysCacheInvalidateMethodInvoked = false;
        SurrogateKeysCache.prototype.invalidate = function(cacheEntry) {
            cacheEntryKey = cacheEntry.key();
            surrogateKeysCacheInvalidateMethodInvoked = true;
        };

        Step(
            function createTemplateToDelete() {
                createTemplate(this);
            },
            function deleteValidTemplate(err) {
                if (err) {
                    throw err;
                }
                var deleteTemplateRequest = {
                    url: '/api/v1/map/named/' + expectedTemplateId + '/?api_key=1234',
                    method: 'DELETE',
                    headers: {
                        host: templateOwner,
                        'Content-Type': 'application/json'
                    }
                };
                var next = this;
                assert.response(server,
                    deleteTemplateRequest,
                    {
                        status: 204
                    },
                    function(res) {
                        next(null, res);
                    }
                );
            },
            function checkValidUpdate(err) {
                if (err) {
                    throw err;
                }

                assert.ok(surrogateKeysCacheInvalidateMethodInvoked);
                assert.equal(cacheEntryKey, new NamedMapsCacheEntry(templateOwner, templateName).key());

                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    });

    suiteTeardown(function(done) {
        SurrogateKeysCache.prototype.invalidate = surrogateKeysCacheInvalidateFn;
        // Enable Varnish purge for tests
        serverOptions.varnish_purge_enabled = false;
        sqlApiServer.close(done);
    });

});
