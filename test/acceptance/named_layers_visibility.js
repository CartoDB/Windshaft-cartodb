var step = require('step');
var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');
var mapnik = require('windshaft').mapnik;

var IMAGE_TOLERANCE = 20;

describe('layers visibility for previews', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);
    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var username = 'localhost';

    function createLayer (color, layerId) {
        return {
            type: 'mapnik',
            id: layerId,
            options: {
                sql: 'select * from populated_places_simple_reduced where cartodb_id % 2 = 1',
                cartocss: '#layer { marker-fill: ' + color + '; }',
                cartocss_version: '2.3.0'
            }
        };
    }

    function createTemplate(context) {
        return {
            version: '0.0.1',
            name: context.name,
            auth: {
                method: 'open'
            },
            view: {
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
            },
            layergroup: {
                layers: context.layers
            },
            preview_layers: context.layerPerview
        };
    }


    afterEach(function (done) {
        test_helper.deleteRedisKeys({
            'user:localhost:mapviews:global': 5
        }, done);
    });

    function previewFixture(version) {
        return './test/fixtures/previews/populated_places_simple_reduced-' + version + '.png';
    }

    var threeLayerPointDistintColor = [
        createLayer('red'),
        createLayer('orange'),
        createLayer('blue', 'layer2')
    ];

    var scenarios = [{
        name: 'preview_layers_red',
        layerPerview: {
            '0': true,
            '1': false,
            'layer2': false
        },
        layers: threeLayerPointDistintColor
    }, {
        name: 'preview_layers_orange',
        layerPerview: {
            '0': false,
            '1': true,
            'layer2': false
        },
        layers: threeLayerPointDistintColor
    }, {
        name: 'preview_layers_blue',
        layerPerview: {
            '0': false,
            '1': false,
            'layer2': true
        },
        layers: threeLayerPointDistintColor
    }, {
        name: 'preview_layers_orange_blue',
        layerPerview: {
            '0': false,
            '1': true,
            'layer2': true
        },
        layers: threeLayerPointDistintColor
    }];

    scenarios.forEach(function (scenario) {
        it('should filter layers for template: ' + scenario.name, function (done) {
            step(
                function addTemplate () {
                    var next = this;
                    var template = createTemplate(scenario);

                    templateMaps.addTemplate(username, template, next);
                },
                function requestPreview (err) {
                    assert.ifError(err);

                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/static/named/' + scenario.name + '/640/480.png',
                        method: 'GET',
                        headers: {
                            host: 'localhost'
                        },
                        encoding: 'binary'
                    }, {
                        status: 200,
                        headers: {
                            'content-type': 'image/png'
                        }
                    }, function (res, err) {
                        next(err, res);
                    });
                },
                function checkPreview (err, res) {
                    assert.ifError(err);

                    var next = this;
                    var img = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                    var previewFixturePath = previewFixture(scenario.name);

                    assert.imageIsSimilarToFile(img, previewFixturePath, IMAGE_TOLERANCE, next);
                },
                function deleteTemplate(err) {
                    assert.ifError(err);

                    var next = this;

                    templateMaps.delTemplate(username, scenario.name, next);
                },
                function finish (err) {
                    done(err);
                }
            );
        });
    });

});
