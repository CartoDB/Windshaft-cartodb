'use strict';

require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('multilayer stats disabled', function() {

    before(function () {
        this.layerMetadataConfig = global.environment.enabledFeatures.layerMetadata;
        this.layerStatsConfig = global.environment.enabledFeatures.layerStats;
        global.environment.enabledFeatures.layerMetadata = true;
        global.environment.enabledFeatures.layerStats = false;
    });

    after(function () {
        global.environment.enabledFeatures.layerMetadata = this.layerMetadataConfig;
        global.environment.enabledFeatures.layerStats = this.layerStatsConfig;
    });


    function testLayerMetadataStats(testScenario) {

        it(testScenario.desc, function(done) {
            var mapConfig =  {
                version: '1.3.0',
                layers: testScenario.layers
            };

            var testClient = new TestClient(mapConfig);

            testClient.getLayergroup(function(err, layergroup) {
                assert.ifError(err);
                layergroup.metadata.layers.forEach(function (layer) {
                    if (layer.type !== 'torque' && layer.type !== 'mapnik') {
                        assert.ok(!('stats' in layer.meta));
                    } else if (layer.type !== 'torque') {
                        assert.ok(!('stats' in layer.meta));
                        assert.ok('cartocss' in layer.meta);
                    } else {
                        assert.ok('cartocss' in layer.meta);
                        // check torque metadata at least match in number
                        var torqueLayers = mapConfig.layers.filter(function(layer) { return layer.type === 'torque'; });
                        if (torqueLayers.length) {
                            assert.equal(Object.keys(layergroup.metadata.torque).length, torqueLayers.length);
                        }
                    }
                });

                testClient.drain(done);
            });
        });
    }

    var cartocssVersion = '2.3.0';
    var cartocss = '#layer { line-width:16; }';
    var sql = "select 1 as i, st_setsrid('LINESTRING(0 0, 1 0)'::geometry, 4326) as the_geom, " +
              "st_setsrid('LINESTRING(0 0, 1 0)'::geometry, 3857) as the_geom_webmercator";
    var sqlWadus = "select 1 as wadus, st_setsrid('LINESTRING(0 0, 1 0)'::geometry, 4326) as the_geom, " +
                   "st_setsrid('LINESTRING(0 0, 1 0)'::geometry, 3857) as the_geom_webmercator";

    var httpLayer = {
        type: 'http',
        options: {
            urlTemplate: 'http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
            subdomains: ['a','b','c']
        }
    };

    var torqueLayer = {
        type: 'torque',
        options: {
            sql: "select 1 id, '1970-01-02'::date d, 'POINT(0 0)'::geometry the_geom_webmercator",
            cartocss: [
                "Map {",
                    "-torque-frame-count:2;",
                    "-torque-resolution:3;",
                    "-torque-time-attribute:d;",
                    "-torque-aggregation-function:'count(id)';",
                "}"
            ].join(' '),
            cartocss_version: '2.0.1'
        }
    };

    var mapnikLayer = {
        type: 'mapnik',
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var mapnikInteractivityLayer = {
        type: 'mapnik',
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss,
            interactivity: 'i'
        }
    };

    var cartodbLayer = {
        type: 'cartodb',
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var cartodbInteractivityLayer = {
        type: 'cartodb',
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss,
            interactivity: 'i'
        }
    };

    var cartodbWadusInteractivityLayer = {
        type: 'cartodb',
        options: {
            sql: sqlWadus,
            cartocss_version: cartocssVersion,
            cartocss: cartocss,
            interactivity: 'wadus'
        }
    };

    var noTypeLayer = {
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var noTypeInteractivityLayer = {
        options: {
            sql: sql,
            cartocss_version: cartocssVersion,
            cartocss: cartocss,
            interactivity: 'i'
        }
    };

    var testScenarios = [
        {
            desc: 'one layer, no interactivity',
            layers: [cartodbLayer]
        },
        {
            desc: 'two layers, different interactivity columns',
            layers: [
                cartodbWadusInteractivityLayer,
                cartodbInteractivityLayer
            ]
        },
        {
            desc: 'torque + interactivity layers',
            layers: [
                torqueLayer,
                cartodbWadusInteractivityLayer,
                cartodbInteractivityLayer
            ]
        },
        {
            desc: 'interactivity + torque + interactivity',
            layers: [
                cartodbInteractivityLayer,
                torqueLayer,
                cartodbInteractivityLayer
            ]
        },
        {
            desc: 'http + interactivity + torque + no interactivity + torque + interactivity',
            layers: [
                httpLayer,
                cartodbInteractivityLayer,
                torqueLayer,
                cartodbLayer,
                torqueLayer,
                cartodbWadusInteractivityLayer
            ]
        },
        {
            desc: 'mapnik type – two layers, interactivity mix',
            layers: [
                mapnikLayer,
                mapnikInteractivityLayer
            ]
        },
        {
            desc: 'mapnik type – http + interactivity + torque + interactivity',
            layers: [
                httpLayer,
                mapnikInteractivityLayer,
                torqueLayer,
                cartodbInteractivityLayer
            ]
        },
        {
            desc: 'no type – two layers, interactivity mix',
            layers: [
                noTypeLayer,
                noTypeInteractivityLayer
            ]
        },
        {
            desc: 'no type – http + interactivity + torque + interactivity',
            layers: [
                httpLayer,
                noTypeInteractivityLayer,
                torqueLayer,
                noTypeInteractivityLayer
            ]
        }
    ];

    testScenarios.forEach(testLayerMetadataStats);

});
