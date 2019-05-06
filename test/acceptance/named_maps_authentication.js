'use strict';

var test_helper = require('../support/test_helper');
var RedisPool = require('redis-mpool');
var querystring = require('querystring');

var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');
var NamedMapsCacheEntry = require('../../lib/cartodb/cache/model/named_maps_entry');

describe('named maps authentication', function() {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var wadusLayer = {
        type: 'cartodb',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { marker-fill: <%= color %>; }',
            cartocss_version: '2.3.0'
        }
    };

    var username = 'localhost';

    var templateName = 'valid_template';
    var template = {
        version: '0.0.1',
        name: templateName,
        auth: {
            method: 'open'
        },
        "placeholders": {
            "color": {
                "type": "css_color",
                "default": "#cc3300"
            }
        },
        layergroup: {
            layers: [
                wadusLayer
            ]
        }
    };

    var tokenAuthTemplateName = 'auth_valid_template';
    var tokenAuthTemplate = {
        version: '0.0.1',
        name: tokenAuthTemplateName,
        auth: {
            method: 'token',
            valid_tokens: ['valid1', 'valid2']
        },
        placeholders: {
            color: {
                "type": "css_color",
                "default": "#cc3300"
            }
        },
        layergroup: {
            layers: [
                wadusLayer
            ]
        }
    };


    var namedMapLayer = {
        type: 'named',
        options: {
            name: templateName,
            config: {},
            auth_tokens: []
        }
    };

    var nestedNamedMapTemplateName = 'nested_template';
    var nestedNamedMapTemplate = {
        version: '0.0.1',
        name: nestedNamedMapTemplateName,
        auth: {
            method: 'open'
        },
        layergroup: {
            layers: [
                namedMapLayer
            ]
        }
    };

    beforeEach(function (done) {
        templateMaps.addTemplate(username, nestedNamedMapTemplate, function (err) {
            if (err) {
                return done(err);
            }
            templateMaps.addTemplate(username, tokenAuthTemplate, function (err) {
                if (err) {
                    return done(err);
                }
                templateMaps.addTemplate(username, template, function (err) {
                    return done(err);
                });
            });
        });
    });

    afterEach(function (done) {
        templateMaps.delTemplate(username, nestedNamedMapTemplateName, function (err) {
            if (err) {
                return done(err);
            }
            templateMaps.delTemplate(username, tokenAuthTemplateName, function (err) {
                if (err) {
                    return done(err);
                }
                templateMaps.delTemplate(username, templateName, function (err) {
                    return done(err);
                });
            });
        });
    });

    function getNamedTile(name, z, x, y, options, callback) {

        var url = '/api/v1/map/named/' + name + '/all/' + [z,x,y].join('/') + '.png';
        if (options.params) {
            url = url + '?' + querystring.stringify(options.params);
        }
        var requestOptions = {
            url: url,
            method: 'GET',
            headers: {
                host: username
            },
            encoding: 'binary'
        };

        var statusCode = options.status || 200;

        var expectedResponse = {
            status: statusCode,
            headers: {
                'Content-Type': statusCode === 200 ? 'image/png' : 'application/json; charset=utf-8'
            }
        };

        assert.response(server,
            requestOptions,
            expectedResponse,
            function (res, err) {
                var img;
                if (!err && res.headers['content-type'] === 'image/png') {
                    img = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                }
                return callback(err, res, img);
            }
        );
    }

    describe('tiles', function() {
        it('should return a 404 error for nonexistent template name', function (done) {
            var nonexistentName = 'nonexistent';
            getNamedTile(nonexistentName, 0, 0, 0, { status: 404 }, function(err, res) {
                assert.ok(!err);
                assert.deepEqual(
                    JSON.parse(res.body).errors,
                    ["Template '" + nonexistentName + "' of user '" + username + "' not found"]
                );
                done();
            });
        });

        it('should return 403 if not properly authorized', function(done) {
            getNamedTile(tokenAuthTemplateName, 0, 0, 0, { status: 403 }, function(err, res) {
                assert.ok(!err);
                assert.deepEqual(JSON.parse(res.body).errors, ['Unauthorized template instantiation']);
                done();
            });
        });

        it('should return 200 if properly authorized', function(done) {
            getNamedTile(tokenAuthTemplateName, 0, 0, 0, { params: { auth_token: 'valid1' } }, function(err, res, img) {
                assert.equal(img.width(), 256);
                assert.equal(img.height(), 256);

                assert.ok(!err);
                test_helper.checkSurrogateKey(res, new NamedMapsCacheEntry(username, tokenAuthTemplateName).key());
                done();
            });
        });
    });

    function getStaticMap(name, options, callback) {

        var url = '/api/v1/map/static/named/' + name + '/640/480.png';
        if (options.params) {
            url = url + '?' + querystring.stringify(options.params);
        }
        var requestOptions = {
            url: url,
            method: 'GET',
            headers: {
                host: username
            },
            encoding: 'binary'
        };

        var statusCode = options.status || 200;

        var expectedResponse = {
            status: statusCode,
            headers: {
                'Content-Type': statusCode === 200 ? 'image/png' : 'application/json; charset=utf-8'
            }
        };

        assert.response(server,
            requestOptions,
            expectedResponse,
            function (res, err) {
                var img;
                if (!err && res.headers['content-type'] === 'image/png') {
                    img = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                }
                return callback(err, res, img);
            }
        );
    }
    describe('static maps', function() {
        it('should return a 404 error for nonexistent template name', function (done) {
            var nonexistentName = 'nonexistent';
            getStaticMap(nonexistentName, { status: 404 }, function(err, res) {
                assert.ok(!err);
                assert.deepEqual(
                    JSON.parse(res.body).errors,
                    ["Template '" + nonexistentName + "' of user '" + username + "' not found"]
                );
                done();
            });
        });

        it('should return 403 if not properly authorized', function(done) {
            getStaticMap(tokenAuthTemplateName, { status: 403 }, function(err, res) {
                assert.ok(!err);
                assert.deepEqual(JSON.parse(res.body).errors, ['Unauthorized template instantiation']);
                done();
            });
        });

        it('should return 200 if properly authorized', function(done) {
            getStaticMap(tokenAuthTemplateName, { params: { auth_token: 'valid1' } }, function(err, res, img) {
                assert.ok(!err);

                assert.equal(img.width(), 640);
                assert.equal(img.height(), 480);

                test_helper.checkSurrogateKey(res, new NamedMapsCacheEntry(username, tokenAuthTemplateName).key());
                test_helper.deleteRedisKeys({'user:localhost:mapviews:global': 5}, done);
            });
        });
    });

});
