require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('Create mapnik layergroup', function() {
    before(function() {
        this.layerMetadataConfig = global.environment.enabledFeatures.layerMetadata;
        this.layerStatsConfig = global.environment.enabledFeatures.layerStats;
        global.environment.enabledFeatures.layerMetadata = true;
        global.environment.enabledFeatures.layerStats = true;
    });

    after(function() {
        global.environment.enabledFeatures.layerMetadata = this.layerMetadataConfig;
        global.environment.enabledFeatures.layerStats = this.layerStatsConfig;
    });

    var cartocssVersion = '2.3.0';
    var cartocss = '#layer { line-width:16; }';

    var mapnikLayer1 = {
        type: 'mapnik',
        options: {
            sql: 'select * from test_table limit 1',
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var mapnikLayer2 = {
        type: 'mapnik',
        options: {
            sql: 'select * from test_table_2 limit 2',
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var mapnikLayer3 = {
        type: 'mapnik',
        options: {
            sql: 'select * from test_table_3 limit 3',
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var mapnikLayer4 = {
        type: 'mapnik',
        options: {
            sql: [
                'select t1.cartodb_id, t1.the_geom, t1.the_geom_webmercator, t2.address',
                ' from test_table t1, test_table_2 t2',
                ' where t1.cartodb_id = t2.cartodb_id;'
            ].join(''),
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    var httpLayer = {
        type: 'http',
        options: {
            urlTemplate: 'http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
            subdomains: ['a','b','c']
        }
    };

    var mapnikLayerGeomColumn = {
        type: 'mapnik',
        options: {
            sql: 'select *, the_geom as my_geom from test_table_3 limit 2',
            geom_column: 'my_geom',
            cartocss_version: cartocssVersion,
            cartocss: cartocss
        }
    };

    function mapnikBasicLayerId(index) {
        return 'layer' + index;
    }
    function typeLayerId(type, index) {
        return type + '-' + mapnikBasicLayerId(index);
    }

    it('with one mapnik layer should response with meta-stats for that layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer1
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
            testClient.drain(done);
        });
    });

    it('with two mapnik layer should response with meta-stats for every layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer1,
                mapnikLayer2
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
            assert.equal(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
            assert.equal(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 2);
            testClient.drain(done);
        });
    });

    it('with three mapnik layer should response with meta-stats for every layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer1,
                mapnikLayer2,
                mapnikLayer3
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
            assert.equal(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
            assert.equal(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 2);
            assert.equal(layergroup.metadata.layers[2].id, mapnikBasicLayerId(2));
            assert.equal(layergroup.metadata.layers[2].meta.stats.estimatedFeatureCount, 3);
            testClient.drain(done);
        });
    });

    it('with one mapnik layer (sql with join) should response with meta-stats for that layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer4
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
            testClient.drain(done);
        });
    });

    it('with two mapnik layer (sql with join) should response with meta-stats for every layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer4,
                mapnikLayer4
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
            assert.equal(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
            assert.equal(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 5);
            testClient.drain(done);
        });
    });

    it('with two mapnik layer (with & without join) should response with meta-stats for every layer', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer3,
                mapnikLayer4
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 3);
            assert.ok(!layergroup.metadata.layers[0].meta.stats[1]);
            assert.equal(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
            assert.equal(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 5);
            assert.ok(!layergroup.metadata.layers[2]);
            testClient.drain(done);
        });
    });

    it('with mapnik and layer and httplayer should response with layer metadata with same order', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayer1,
                httpLayer
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[0].type, 'mapnik');
            assert.equal(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
            assert.equal(layergroup.metadata.layers[1].id, typeLayerId('http', 0));
            assert.equal(layergroup.metadata.layers[1].type, 'http');
            testClient.drain(done);
        });
    });

    it('with httpLayer and mapnik layer should response with layer metadata with same order', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                httpLayer,
                mapnikLayer1
            ]
        });

        testClient.getLayergroup(function (err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, typeLayerId('http', 0));
            assert.equal(layergroup.metadata.layers[0].type, 'http');
            assert.ok(!layergroup.metadata.layers[0].meta.cartocss);
            assert.equal(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 1);
            assert.equal(layergroup.metadata.layers[1].id, mapnikBasicLayerId(0));
            assert.equal(layergroup.metadata.layers[1].type, 'mapnik');
            assert.equal(layergroup.metadata.layers[1].meta.cartocss, cartocss);
            testClient.drain(done);
        });
    });

    it('should work with different geom_column', function(done) {
        var testClient = new TestClient({
            version: '1.4.0',
            layers: [
                mapnikLayerGeomColumn
            ]
        });

        testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err);
            assert.equal(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
            // we don't care about stats here as is an aliased column
            assert.ok(layergroup.metadata.layers[0].meta.stats.hasOwnProperty('estimatedFeatureCount'));
            testClient.drain(done);
        });
    });
});
