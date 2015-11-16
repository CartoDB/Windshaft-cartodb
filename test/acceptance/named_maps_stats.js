var test_helper = require('../support/test_helper');
var RedisPool = require('redis-mpool');
var querystring = require('querystring');

var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');
var NamedMapsCacheEntry = require('../../lib/cartodb/cache/model/named_maps_entry');

describe('named maps preview stats', function() {
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
        "placeholders": {
            "color": {
                "type": "css_color",
                "default": "#cc3300"
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

    it('should return 200 if properly authorized', function(done) {
        getStaticMap(templateName, { params: { auth_token: 'valid1' } }, function(err, res, img) {
            assert.ok(!err);

            assert.equal(img.width(), 640);
            assert.equal(img.height(), 480);

            test_helper.checkSurrogateKey(res, new NamedMapsCacheEntry(username, templateName).key());
            var redisKeysToDelete = { 'user:localhost:mapviews:global': 5 };
            redisKeysToDelete['user:localhost:mapviews:stat_tag:' + statTag] = 5;
            test_helper.deleteRedisKeys(redisKeysToDelete, done);
        });
    });
});
