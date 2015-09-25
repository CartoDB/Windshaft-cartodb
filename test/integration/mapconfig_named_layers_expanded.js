require('../support/test_helper');

var assert = require('assert');
var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');
var PgConnection = require(__dirname + '/../../lib/cartodb/backends/pg_connection');
var MapConfigNamedLayersAdapter = require('../../lib/cartodb/models/mapconfig_named_layers_adapter');

describe('mapconfig_named_layers_adapter', function() {

    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);
    var pgConnection = new PgConnection(require('cartodb-redis')({ pool: redisPool }));

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var mapConfigNamedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);

    var wadusLayer = {
        type: 'cartodb',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { marker-fill: <%= color %>; }',
            cartocss_version: '2.3.0'
        }
    };

    var wadusMapnikLayer = {
        type: 'mapnik',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { polygon-fill: <%= polygon_color %>; }',
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
        layergroup: {
            layers: [
                wadusLayer
            ]
        }
    };

    var multipleLayersTemplateName = 'multiple_valid_template';
    var multipleLayersTemplate = {
        version: '0.0.1',
        name: multipleLayersTemplateName,
        auth: {
            method: 'token',
            valid_tokens: ['valid1', 'valid2']
        },
        "placeholders": {
            "polygon_color": {
                "type": "css_color",
                "default": "green"
            },
            "color": {
                "type": "css_color",
                "default": "red"
            }
        },
        layergroup: {
            layers: [
                wadusMapnikLayer,
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

    function makeNamedMapLayerConfig(options) {
        return {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: options
                }
            ]
        };
    }


    beforeEach(function(done) {
        templateMaps.addTemplate(username, template, done);
    });

    afterEach(function(done) {
        templateMaps.delTemplate(username, templateName, done);
    });

    it('should fail for named map layer with missing name', function(done) {
        var missingNamedMapLayerConfig = makeNamedMapLayerConfig({
            config: {}
        });
        mapConfigNamedLayersAdapter.getLayers(username, missingNamedMapLayerConfig.layers, pgConnection,
            function(err, layers, datasource) {
                assert.ok(err);
                assert.ok(!layers);
                assert.ok(!datasource);
                assert.equal(err.message, 'Missing Named Map `name` in layer options');

                done();
            }
        );
    });

    it('should fail for non-existing template name', function(done) {
        var missingTemplateName = 'wadus';
        var nonExistentNamedMapLayerConfig = makeNamedMapLayerConfig({
            name: missingTemplateName
        });
        mapConfigNamedLayersAdapter.getLayers(username, nonExistentNamedMapLayerConfig.layers, pgConnection,
            function(err, layers, datasource) {
                assert.ok(err);
                assert.ok(!layers);
                assert.ok(!datasource);
                assert.equal(
                    err.message, "Template '" + missingTemplateName + "' of user '" + username + "' not found"
                );

                done();
            }
        );
    });

    it('should fail if not properly authorized', function(done) {
        templateMaps.addTemplate(username, tokenAuthTemplate, function(err) {
            if (err) {
                return done(err);
            }

            var nonAuthTokensNamedMapLayerConfig = makeNamedMapLayerConfig({
                name: tokenAuthTemplateName
            });
            mapConfigNamedLayersAdapter.getLayers(username, nonAuthTokensNamedMapLayerConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    assert.ok(err);
                    assert.ok(!layers);
                    assert.ok(!datasource);
                    assert.equal(err.message, "Unauthorized '" + tokenAuthTemplateName + "' template instantiation");

                    templateMaps.delTemplate(username, tokenAuthTemplateName, done);
                }
            );
        });
    });

    it('should fail for nested named map layers', function(done) {
        templateMaps.addTemplate(username, nestedNamedMapTemplate, function(err) {
            if (err) {
                return done(err);
            }

            var nestedNamedMapLayerConfig = makeNamedMapLayerConfig({
                name: nestedNamedMapTemplateName
            });
            mapConfigNamedLayersAdapter.getLayers(username, nestedNamedMapLayerConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    assert.ok(err);
                    assert.ok(!layers);
                    assert.ok(!datasource);
                    assert.equal(err.message, 'Nested named layers are not allowed');

                    templateMaps.delTemplate(username, nestedNamedMapTemplateName, done);
                }
            );
        });
    });

    it('should return an expanded list of layers for a named map layer', function(done) {
        var validNamedMapMapLayerConfig = makeNamedMapLayerConfig({
            name: templateName
        });
        mapConfigNamedLayersAdapter.getLayers(username, validNamedMapMapLayerConfig.layers, pgConnection,
            function(err, layers, datasource) {
                assert.ok(!err);
                assert.ok(layers.length, 1);
                assert.ok(layers[0].type, 'cartodb');
                assert.notEqual(datasource.getLayerDatasource(0), undefined);

                done();
            }
        );
    });

    it('should return on auth=token with valid tokens provided', function(done) {
        templateMaps.addTemplate(username, tokenAuthTemplate, function(err) {
            if (err) {
                return done(err);
            }

            var validAuthTokensNamedMapLayerConfig = makeNamedMapLayerConfig({
                name: tokenAuthTemplateName,
                auth_tokens: ['valid1']
            });
            mapConfigNamedLayersAdapter.getLayers(username, validAuthTokensNamedMapLayerConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    assert.ok(!err);
                    assert.equal(layers.length, 1);
                    assert.notEqual(datasource.getLayerDatasource(0), undefined);

                    templateMaps.delTemplate(username, tokenAuthTemplateName, done);
                }
            );
        });
    });

    it('should return an expanded list of layers for a named map layer, multiple layers version', function(done) {
        templateMaps.addTemplate(username, multipleLayersTemplate, function(err) {
            if (err) {
                return done(err);
            }

            var multipleLayersNamedMapLayerConfig = makeNamedMapLayerConfig({
                name: multipleLayersTemplateName,
                auth_tokens: ['valid2']
            });
            mapConfigNamedLayersAdapter.getLayers(username, multipleLayersNamedMapLayerConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    assert.ok(!err);
                    assert.equal(layers.length, 2);

                    assert.equal(layers[0].type, 'mapnik');
                    assert.equal(layers[0].options.cartocss, '#layer { polygon-fill: green; }');
                    assert.notEqual(datasource.getLayerDatasource(0), undefined);

                    assert.equal(layers[1].type, 'cartodb');
                    assert.equal(layers[1].options.cartocss, '#layer { marker-fill: red; }');
                    assert.notEqual(datasource.getLayerDatasource(1), undefined);

                    templateMaps.delTemplate(username, multipleLayersTemplateName, done);
                }
            );
        });
    });

    it('should replace template params with the given config', function(done) {
        templateMaps.addTemplate(username, multipleLayersTemplate, function(err) {
            if (err) {
                return done(err);
            }

            var color = '#cc3300',
                polygonColor = '#ff9900';

            var multipleLayersNamedMapLayerConfig = makeNamedMapLayerConfig({
                name: multipleLayersTemplateName,
                config: {
                    polygon_color: polygonColor,
                    color: color
                },
                auth_tokens: ['valid2']
            });
            mapConfigNamedLayersAdapter.getLayers(username, multipleLayersNamedMapLayerConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    assert.ok(!err);
                    assert.equal(layers.length, 2);

                    assert.equal(layers[0].type, 'mapnik');
                    assert.equal(layers[0].options.cartocss, '#layer { polygon-fill: ' + polygonColor + '; }');
                    assert.notEqual(datasource.getLayerDatasource(0), undefined);

                    assert.equal(layers[1].type, 'cartodb');
                    assert.equal(layers[1].options.cartocss, '#layer { marker-fill: ' + color + '; }');
                    assert.notEqual(datasource.getLayerDatasource(1), undefined);

                    templateMaps.delTemplate(username, multipleLayersTemplateName, done);
                }
            );
        });
    });
});
