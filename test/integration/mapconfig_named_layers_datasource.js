require('../support/test_helper');

var assert = require('assert');
var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/template_maps.js');
var PgConnection = require(__dirname + '/../../lib/cartodb/backends/pg_connection');
var MapConfigNamedLayersAdapter = require('../../lib/cartodb/models/mapconfig_named_layers_adapter');

// configure redis pool instance to use in tests
var redisPool = new RedisPool(global.environment.redis);
var pgConnection = new PgConnection(require('cartodb-redis')({ pool: redisPool }));

var templateMaps = new TemplateMaps(redisPool, {
    max_user_templates: global.environment.maxUserTemplates
});

var mapConfigNamedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);

var wadusSql = 'select 1 wadusLayer, null::geometry the_geom_webmercator';
var wadusLayer = {
    type: 'cartodb',
    options: {
        sql: wadusSql,
        cartocss: '#layer { marker-fill: black; }',
        cartocss_version: '2.3.0'
    }
};

var wadusTemplateSql = 'select 1 wadusTemplateLayer, null::geometry the_geom_webmercator';
var wadusTemplateLayer = {
    type: 'cartodb',
    options: {
        sql: wadusTemplateSql,
        cartocss: '#layer { marker-fill: <%= color %>; }',
        cartocss_version: '2.3.0'
    }
};

var wadusMapnikSql = 'select 1 wadusMapnikLayer, null::geometry the_geom_webmercator';
var wadusMapnikLayer = {
    type: 'mapnik',
    options: {
        sql: wadusMapnikSql,
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
            wadusTemplateLayer
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
            wadusTemplateLayer
        ]
    }
};

describe('named_layers datasources', function() {
    before(function(done) {
        templateMaps.addTemplate(username, template, function(err) {
            if (err) {
                return done(err);
            }
            templateMaps.addTemplate(username, multipleLayersTemplate, done);
        });
    });

    function makeNamedMapLayerConfig(layers) {
        return {
            version: '1.3.0',
            layers: layers
        };
    }

    var simpleNamedLayer = {
        type: 'named',
        options: {
            name: templateName
        }
    };

    var multipleLayersNamedLayer = {
        type: 'named',
        options: {
            name: multipleLayersTemplateName,
            auth_tokens: ['valid2']
        }
    };

    var testScenarios = [
        {
            desc: 'without datasource for non-named layers',
            config: makeNamedMapLayerConfig([wadusLayer]),
            test: function(err, layers, datasource, done) {
                assert.ok(!err);
                assert.equal(layers.length, 1);

                assert.equal(layers[0].type, 'cartodb');
                assert.equal(layers[0].options.sql, wadusSql);
                assert.equal(datasource.getLayerDatasource(0), undefined);

                done();
            }
        },

        {
            desc: 'with datasource for the named layer but not for the normal',
            config: makeNamedMapLayerConfig([wadusLayer, simpleNamedLayer]),
            test: function(err, layers, datasource, done) {
                assert.ok(!err);
                assert.equal(layers.length, 2);

                assert.equal(layers[0].type, 'cartodb');
                assert.equal(layers[0].options.sql, wadusSql);
                assert.equal(datasource.getLayerDatasource(0), undefined);

                assert.equal(layers[1].type, 'cartodb');
                assert.equal(layers[1].options.sql, wadusTemplateSql);
                var layerDatasource = datasource.getLayerDatasource(1);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                done();
            }
        },

        {
            desc: 'with datasource for the multiple layers in the named but not for the normal',
            config: makeNamedMapLayerConfig([wadusLayer, multipleLayersNamedLayer]),
            test: function(err, layers, datasource, done) {
                assert.ok(!err);
                assert.equal(layers.length, 3);

                assert.equal(layers[0].type, 'cartodb');
                assert.equal(layers[0].options.sql, wadusSql);
                assert.equal(datasource.getLayerDatasource(0), undefined);

                assert.equal(layers[1].type, 'mapnik');
                assert.equal(layers[1].options.sql, wadusMapnikSql);
                var layerDatasource = datasource.getLayerDatasource(1);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[2].type, 'cartodb');
                assert.equal(layers[2].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(2);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                done();
            }
        },

        {
            desc: 'all with datasource because all are named',
            config: makeNamedMapLayerConfig([multipleLayersNamedLayer, simpleNamedLayer]),
            test: function(err, layers, datasource, done) {
                assert.ok(!err);
                assert.equal(layers.length, 3);

                assert.equal(layers[0].type, 'mapnik');
                assert.equal(layers[0].options.sql, wadusMapnikSql);
                var layerDatasource = datasource.getLayerDatasource(0);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[1].type, 'cartodb');
                assert.equal(layers[1].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(1);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[2].type, 'cartodb');
                assert.equal(layers[2].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(2);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                done();
            }
        },

        {
            desc: 'with a mix of datasource and no datasource depending if layers are named or not',
            config: makeNamedMapLayerConfig([
                simpleNamedLayer,
                multipleLayersNamedLayer,
                wadusLayer,
                simpleNamedLayer,
                wadusLayer,
                multipleLayersNamedLayer
            ]),
            test: function(err, layers, datasource, done) {

                assert.ok(!err);
                assert.equal(layers.length, 8);

                assert.equal(layers[0].type, 'cartodb');
                assert.equal(layers[0].options.sql, wadusTemplateSql);
                var layerDatasource = datasource.getLayerDatasource(0);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[1].type, 'mapnik');
                assert.equal(layers[1].options.sql, wadusMapnikSql);
                layerDatasource = datasource.getLayerDatasource(1);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[2].type, 'cartodb');
                assert.equal(layers[2].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(2);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[3].type, 'cartodb');
                assert.equal(layers[3].options.sql, wadusSql);
                assert.equal(datasource.getLayerDatasource(3), undefined);

                assert.equal(layers[4].type, 'cartodb');
                assert.equal(layers[4].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(4);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[5].type, 'cartodb');
                assert.equal(layers[5].options.sql, wadusSql);
                assert.equal(datasource.getLayerDatasource(5), undefined);

                assert.equal(layers[6].type, 'mapnik');
                assert.equal(layers[6].options.sql, wadusMapnikSql);
                layerDatasource = datasource.getLayerDatasource(6);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                assert.equal(layers[7].type, 'cartodb');
                assert.equal(layers[7].options.sql, wadusTemplateSql);
                layerDatasource = datasource.getLayerDatasource(7);
                assert.notEqual(layerDatasource, undefined);
                assert.ok(layerDatasource.user);

                done();
            }
        }
    ];

    testScenarios.forEach(function(testScenario) {
        it('should return a list of layers ' + testScenario.desc, function(done) {
            mapConfigNamedLayersAdapter.getLayers(username, testScenario.config.layers, pgConnection,
                function(err, layers, datasource) {
                    testScenario.test(err, layers, datasource, done);
                }
            );
        });
    });

    after(function(done) {
        templateMaps.delTemplate(username, templateName, function(err) {
            if (err) {
                return done(err);
            }
            templateMaps.delTemplate(username, multipleLayersTemplateName, done);
        });
    });
});
