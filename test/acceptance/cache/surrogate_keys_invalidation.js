require(__dirname + '/../../support/test_helper');

var assert      = require('../../support/assert');
var redis       = require('redis');
var step        = require('step');

var NamedMapsCacheEntry = require(__dirname + '/../../../lib/cartodb/cache/model/named_maps_entry');
var CartodbWindshaft = require(__dirname + '/../../../lib/cartodb/cartodb_windshaft');


describe('templates surrogate keys', function() {

    var redisClient = redis.createClient(global.environment.redis.port);

    // Enable Varnish purge for tests
    var varnishHost = global.environment.varnish.host;
    global.environment.varnish.host = '127.0.0.1';
    var varnishPurgeEnabled = global.environment.varnish.purge_enabled;
    global.environment.varnish.purge_enabled = true;

    var serverOptions = require('../../../lib/cartodb/server_options')();
    var server = new CartodbWindshaft(serverOptions);

    var templateOwner = 'localhost',
        templateName = 'acceptance',
        expectedTemplateId = templateName,
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

    var varnishHttpUrl = [
        'http://', global.environment.varnish.host, ':', global.environment.varnish.http_port
    ].join('');

    var cacheEntryKey = new NamedMapsCacheEntry(templateOwner, templateName).key();
    var invalidationMatchHeader = '\\b' + cacheEntryKey + '\\b';

    var nock = require('nock');
    nock.enableNetConnect(/(127.0.0.1:5555|cartocdn.com)/);

    after(function(done) {
        serverOptions.varnish_purge_enabled = false;
        global.environment.varnish.host = varnishHost;
        global.environment.varnish.purge_enabled = varnishPurgeEnabled;

        nock.restore();
        done();
    });

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

        step(
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

    it("invalidates surrogate keys on template update", function(done) {

        var scope = nock(varnishHttpUrl)
            .intercept('/key', 'PURGE')
            .matchHeader('Invalidation-Match', invalidationMatchHeader)
            .reply(204, '');

        step(
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

                assert.equal(scope.pendingMocks().length, 0);

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

    it("invalidates surrogate on template deletion", function(done) {

        var scope = nock(varnishHttpUrl)
            .intercept('/key', 'PURGE')
            .matchHeader('Invalidation-Match', invalidationMatchHeader)
            .reply(204, '');

        step(
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

                assert.equal(scope.pendingMocks().length, 0);

                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    });

    it("should update template even if surrogate key invalidation fails", function(done) {

        var scope = nock(varnishHttpUrl)
            .intercept('/key', 'PURGE')
            .matchHeader('Invalidation-Match', invalidationMatchHeader)
            .reply(503, '');

        step(
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

                assert.equal(scope.pendingMocks().length, 0);

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

});
