var qs = require('querystring');
var testHelper = require('../support/test_helper');
var RedisPool = require('redis-mpool');

var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');

describe('named maps static view', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var username = 'localhost';
    var templateName = 'template_with_view';

    var IMAGE_TOLERANCE = 20;

    function createTemplate(view, layers) {
        return {
            version: '0.0.1',
            name: templateName,
            auth: {
                method: 'open'
            },
            placeholders: {
                color: {
                    type: "css_color",
                    default: "#cc3300"
                }
            },
            view: view,
            layergroup: {
                layers: layers || [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: <%= color %>; }',
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

    function getStaticMap(params, callback) {
        if (!callback) {
            callback = params;
            params = null;
        }

        var url = '/api/v1/map/static/named/' + templateName + '/640/480.png';

        if (params !== null) {
            url += '?' + qs.stringify(params);
        }

        var requestOptions = {
            url: url,
            method: 'GET',
            headers: {
                host: username
            },
            encoding: 'binary'
        };

        var expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': 'image/png'
            }
        };

        // this could be removed once named maps are invalidated, otherwise you hits the cache
        var server = new CartodbWindshaft(serverOptions);

        assert.response(server, requestOptions, expectedResponse, function (res, err) {
            testHelper.deleteRedisKeys({'user:localhost:mapviews:global': 5}, function() {
                return callback(err, mapnik.Image.fromBytes(new Buffer(res.body, 'binary')));
            });
        });
    }

    function previewFixture(version) {
        return './test/fixtures/previews/populated_places_simple_reduced-' + version + '.png';
    }

    it('should return an image estimating its bounds based on dataset', function (done) {
        templateMaps.addTemplate(username, createTemplate(), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap(function(err, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture('estimated'), IMAGE_TOLERANCE, done);
            });
        });
    });

    it('should return an image using view zoom + center', function (done) {
        var view = {
            zoom: 4,
            center: {
                lng: 40,
                lat: 20
            }
        };
        templateMaps.addTemplate(username, createTemplate(view), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap(function(err, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture('zoom-center'), IMAGE_TOLERANCE, done);
            });
        });
    });

    it('should return an image using view bounds', function (done) {
        var view = {
            bounds: {
                west: 0,
                south: 0,
                east: 45,
                north: 45
            }
        };
        templateMaps.addTemplate(username, createTemplate(view), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap(function(err, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture('bounds'), IMAGE_TOLERANCE, done);
            });
        });
    });

    it('should return an image using view zoom + center when bounds are also present', function (done) {
        var view = {
            bounds: {
                west: 0,
                south: 0,
                east: 45,
                north: 45
            },
            zoom: 4,
            center: {
                lng: 40,
                lat: 20
            }
        };
        templateMaps.addTemplate(username, createTemplate(view), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap(function(err, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture('zoom-center'), IMAGE_TOLERANCE, done);
            });
        });
    });

    it('should return override zoom', function (done) {
        var view = {
            bounds: {
                west: 0,
                south: 0,
                east: 45,
                north: 45
            },
            zoom: 4,
            center: {
                lng: 40,
                lat: 20
            }
        };
        templateMaps.addTemplate(username, createTemplate(view), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap({ zoom: 3 }, function(err, img) {
                assert.ok(!err);
                img.save('/tmp/static.png');
                assert.imageIsSimilarToFile(img, previewFixture('override-zoom'), IMAGE_TOLERANCE, done);
            });
        });
    });

    it('should allow to select the layers to render', function (done) {
        var view = {
            bounds: {
                west: 0,
                south: 0,
                east: 45,
                north: 45
            }
        };

        var layers = [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: '#layer { marker-fill: <%= color %>; }',
                    cartocss_version: '2.3.0'
                }
            },
            {
                type: 'mapnik',
                options: {
                    sql: 'select ST_Transform(ST_MakeEnvelope(-45, -45, 45, 45, 4326), 3857) the_geom_webmercator',
                    cartocss: '#layer { polygon-fill: <%= color %>; }',
                    cartocss_version: '2.3.0'
                }
            }
        ];
        templateMaps.addTemplate(username, createTemplate(view, layers), function (err) {
            if (err) {
                return done(err);
            }
            getStaticMap({ layer: 0 }, function(err, img) {
                assert.ok(!err);
                assert.imageIsSimilarToFile(img, previewFixture('bounds'), IMAGE_TOLERANCE, done);
            });
        });
    });

});
