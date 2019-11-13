'use strict';

var testHelper = require('../support/test-helper');
var RedisPool = require('redis-mpool');
var querystring = require('querystring');

var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require('../../lib/server');
var serverOptions = require('../../lib/server-options');
var TemplateMaps = require('../../lib/backends/template-maps');
var NamedMapsCacheEntry = require('../../lib/cache/model/named-maps-entry');

describe('named maps preview stats', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    var redisPool = new RedisPool(global.environment.redis);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var username = 'localhost';

    var statTag = 'wadus_viz';
    var templateName = 'with_stats';
    var template = {
        version: '0.0.1',
        name: templateName,
        auth: {
            method: 'open'
        },
        placeholders: {
            color: {
                type: 'css_color',
                default: '#cc3300'
            }
        },
        layergroup: {
            stat_tag: statTag,
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
                        cartocss: '#layer { marker-fill: <%= color %>; }',
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        }
    };

    beforeEach(function (done) {
        templateMaps.addTemplate(username, template, done);
    });

    afterEach(function (done) {
        templateMaps.delTemplate(username, templateName, done);
    });

    function getStaticMap (name, options, callback) {
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
                    img = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));
                }
                return callback(err, res, img);
            }
        );
    }

    it('should return 200 if properly authorized', function (done) {
        getStaticMap(templateName, { params: { auth_token: 'valid1' } }, function (err, res, img) {
            assert.ok(!err);

            assert.strictEqual(img.width(), 640);
            assert.strictEqual(img.height(), 480);

            testHelper.checkSurrogateKey(res, new NamedMapsCacheEntry(username, templateName).key());
            var redisKeysToDelete = { 'user:localhost:mapviews:global': 5 };
            redisKeysToDelete['user:localhost:mapviews:stat_tag:' + statTag] = 5;
            testHelper.deleteRedisKeys(redisKeysToDelete, done);
        });
    });
});
