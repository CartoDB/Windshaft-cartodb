'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/server-options');

const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

describe('tilejson via mapnik renderer', () => tileJsonSuite(false));
describe('tilejson via postgis renderer', () => tileJsonSuite(true));

function tileJsonSuite (usePostGIS) {
    before(function () {
        serverOptions.renderer.mvt.usePostGIS = usePostGIS;
    });

    after(function () {
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    function tilejsonValidation (tilejson, shouldHaveGrid = false) {
        assert.strictEqual(tilejson.tilejson, '2.2.0');

        assert.ok(Array.isArray(tilejson.tiles), JSON.stringify(tilejson));
        assert.ok(tilejson.tiles.length > 0);

        if (shouldHaveGrid) {
            assert.ok(Array.isArray(tilejson.grids));
            assert.ok(tilejson.grids.length > 0);
        }
    }

    const sql = 'SELECT * FROM populated_places_simple_reduced';
    const cartocss = TestClient.CARTOCSS.POINTS;
    const cartocssVersion = '3.0.12';

    const RASTER_LAYER = {
        options: {
            sql, cartocss, cartocss_version: cartocssVersion
        }
    };
    const RASTER_INTERACTIVITY_LAYER = {
        options: {
            sql,
            cartocss,
            cartocss_version: cartocssVersion,
            interactivity: ['cartodb_id']
        }
    };
    const VECTOR_LAYER = {
        options: {
            sql
        }
    };
    const PLAIN_LAYER = {
        type: 'plain',
        options: {
            color: '#000000'
        }
    };

    function mapConfig (layers) {
        return {
            version: '1.7.0',
            layers: Array.isArray(layers) ? layers : [layers]
        };
    }

    describe('per layer', function () {
        it('should expose raster + vector tilejson for raster layers', function (done) {
            var testClient = new TestClient(mapConfig(RASTER_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                assert.strictEqual(metadata.layers.length, 1);

                const layer = metadata.layers[0];
                assert.deepStrictEqual(Object.keys(layer.tilejson), ['vector', 'raster']);

                Object.keys(layer.tilejson).forEach(k => {
                    tilejsonValidation(layer.tilejson[k]);
                });

                testClient.drain(done);
            });
        });

        it('should expose just the vector tilejson vector only layers', function (done) {
            var testClient = new TestClient(mapConfig(VECTOR_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                assert.strictEqual(metadata.layers.length, 1);

                const layer = metadata.layers[0];
                assert.deepStrictEqual(Object.keys(layer.tilejson), ['vector']);

                Object.keys(layer.tilejson).forEach(k => {
                    tilejsonValidation(layer.tilejson[k]);
                });

                testClient.drain(done);
            });
        });

        it('should expose just the raster tilejson plain layers', function (done) {
            var testClient = new TestClient(mapConfig(PLAIN_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                assert.strictEqual(metadata.layers.length, 1);

                const layer = metadata.layers[0];
                assert.deepStrictEqual(Object.keys(layer.tilejson), ['raster']);

                Object.keys(layer.tilejson).forEach(k => {
                    tilejsonValidation(layer.tilejson[k]);
                });

                testClient.drain(done);
            });
        });

        it('should expose grids for the raster layer with interactivity', function (done) {
            var testClient = new TestClient(mapConfig(RASTER_INTERACTIVITY_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                assert.strictEqual(metadata.layers.length, 1);

                const layer = metadata.layers[0];
                assert.deepStrictEqual(Object.keys(layer.tilejson), ['vector', 'raster']);

                tilejsonValidation(layer.tilejson.vector);
                tilejsonValidation(layer.tilejson.raster, true);

                testClient.drain(done);
            });
        });

        it('should work with several layers', function (done) {
            var testClient = new TestClient(mapConfig([RASTER_LAYER, RASTER_INTERACTIVITY_LAYER]));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                assert.strictEqual(metadata.layers.length, 2);

                assert.deepStrictEqual(Object.keys(metadata.layers[0].tilejson), ['vector', 'raster']);
                tilejsonValidation(metadata.layers[0].tilejson.vector);
                tilejsonValidation(metadata.layers[0].tilejson.raster);

                assert.deepStrictEqual(Object.keys(metadata.layers[1].tilejson), ['vector', 'raster']);
                tilejsonValidation(metadata.layers[1].tilejson.vector);
                tilejsonValidation(metadata.layers[1].tilejson.raster, true);

                testClient.drain(done);
            });
        });
    });

    describe('root tilejson', function () {
        it('should expose just the `vector` tilejson and URL when for vector only mapnik layers', function (done) {
            var testClient = new TestClient(mapConfig(VECTOR_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                const tilejson = metadata.tilejson;
                assert.deepStrictEqual(Object.keys(tilejson), ['vector']);

                Object.keys(tilejson).forEach(k => {
                    tilejsonValidation(tilejson[k]);
                });

                const url = metadata.url;
                assert.deepStrictEqual(Object.keys(url), ['vector']);

                assert.ok(url.vector.urlTemplate);
                assert.ok(url.vector.subdomains);

                testClient.drain(done);
            });
        });

        it('should expose just the `vector` and `raster` tilejson and urls for mapnik layers', function (done) {
            var testClient = new TestClient(mapConfig(RASTER_LAYER));

            testClient.getLayergroup(function (err, layergroupResult) {
                assert.ok(!err, err);
                const metadata = layergroupResult.metadata;
                assert.ok(metadata);

                const tilejson = metadata.tilejson;
                assert.deepStrictEqual(Object.keys(tilejson), ['vector', 'raster']);

                Object.keys(tilejson).forEach(k => {
                    tilejsonValidation(tilejson[k]);
                });

                const url = metadata.url;
                assert.deepStrictEqual(Object.keys(url), ['vector', 'raster']);

                assert.ok(url.vector.urlTemplate);
                assert.ok(url.vector.subdomains);

                assert.ok(url.raster.urlTemplate);
                assert.ok(url.raster.subdomains);

                testClient.drain(done);
            });
        });
    });
}
