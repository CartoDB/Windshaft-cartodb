require('../support/test_helper');
var RedisPool = require('redis-mpool');

var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');

describe('named maps provider cache', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var username = 'localhost';
    var templateName = 'template_with_color';

    var IMAGE_TOLERANCE = 20;

    function createTemplate(color) {
        return {
            version: '0.0.1',
            name: templateName,
            auth: {
                method: 'open'
            },
            placeholders: {
                color: {
                    type: "css_color",
                    default: color
                }
            },
            layergroup: {
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: <%= color %>; marker-line-color: <%= color %>; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        };
    }

    afterEach(function (done) {
        templateMaps.delTemplate(username, templateName, done);
    });

    function getNamedTile(options, callback) {
        if (!callback) {
            callback = options;
            options = {};
        }

        var url = '/api/v1/map/named/' + templateName + '/all/' + [0,0,0].join('/') + '.png';

        var requestOptions = {
            url: url,
            method: 'GET',
            headers: {
                host: username
            },
            encoding: 'binary'
        };

        var statusCode = options.statusCode || 200;

        var expectedResponse = {
            status: statusCode,
            headers: {
                'Content-Type': statusCode === 200 ? 'image/png' : 'application/json; charset=utf-8'
            }
        };

        assert.response(server, requestOptions, expectedResponse, function (res, err) {
            var img;
            if (statusCode === 200) {
                img = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
            }
            return callback(err, res, img);
        });
    }

    function previewFixture(color) {
        return './test/fixtures/provider/populated_places_simple_reduced-' + color + '.png';
    }

    var colors = ['red', 'red', 'green', 'blue'];
    colors.forEach(function(color) {
        it('should return an image estimating its bounds based on dataset', function (done) {
            templateMaps.addTemplate(username, createTemplate(color), function (err) {
                if (err) {
                    return done(err);
                }
                getNamedTile(function(err, res, img) {
                    assert.ok(!err);
                    assert.imageIsSimilarToFile(img, previewFixture(color), IMAGE_TOLERANCE, done);
                });
            });
        });
    });

    it('should fail to use template from named map provider after template deletion', function (done) {
        var color = 'black';
        templateMaps.addTemplate(username, createTemplate(color), function (err) {
            if (err) {
                return done(err);
            }
            getNamedTile(function(err, res, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture(color), IMAGE_TOLERANCE, function(err) {
                    assert.ok(!err);

                    templateMaps.delTemplate(username, templateName, function (err) {
                        assert.ok(!err);

                        getNamedTile({ statusCode: 404 }, function(err, res) {
                            assert.ok(!err);
                            assert.deepEqual(
                                JSON.parse(res.body),
                                { errors: ["Template 'template_with_color' of user 'localhost' not found"] }
                            );

                            // add template again so it's clean in afterEach
                            templateMaps.addTemplate(username, createTemplate(color), done);
                        });
                    });
                });
            });
        });
    });

});
