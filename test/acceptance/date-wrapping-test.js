'use strict';

const assert = require('assert');
const TestClient = require('../support/test-client');
const mapConfigFactory = require('../fixtures/test_mapconfigFactory');
const serverOptions = require('../../lib/server-options');

const usePgMvtRenderer = serverOptions.renderer.mvt.usePostGIS;
const describeMvt = !usePgMvtRenderer ? describe : describe.skip;

describeMvt('date-wrapping', () => {
    let testClient;

    describe('when a map instantiation has one single layer', () => {
        describe('and the layer has the "dates_as_numbers" option enabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({ layerOptions: [{ dates_as_numbers: true }] });
                testClient = new TestClient(mapConfig);
            });

            afterEach(done => testClient.drain(done));

            it('should return date columns casted as numbers', done => {
                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    assert.ifError(err);
                    const expected = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0, date: 1527810000 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1, date: 1527900000 }
                        }
                    ];
                    const actual = JSON.parse(mvt.toGeoJSONSync(0)).features;

                    assert.deepStrictEqual(actual, expected);
                    done();
                });
            });

            it('should return metadata with casted columns', done => {
                testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    assert.deepStrictEqual(layergroup.metadata.layers[0].meta.dates_as_numbers, ['date']);
                    done();
                });
            });
        });

        describe('and the layer has the "dates_as_numbers" option disabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({ layerOptions: [{ dates_as_numbers: false }] });
                testClient = new TestClient(mapConfig);
            });

            afterEach(done => testClient.drain(done));

            it('should return date columns as dates', done => {
                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    assert.ifError(err);
                    const expected = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1 }
                        }
                    ];
                    const actual = JSON.parse(mvt.toGeoJSONSync(0)).features;

                    assert.deepStrictEqual(actual, expected);
                    done();
                });
            });
        });
    });

    describe('when a map instantiation has multiple layers', () => {
        afterEach(done => testClient.drain(done));

        describe('and both layers have the "dates_as_numbers" option enabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({
                    numberOfLayers: 2,
                    layerOptions: [
                        { dates_as_numbers: true },
                        { dates_as_numbers: true }
                    ]
                });
                testClient = new TestClient(mapConfig);
            });

            it('should return dates as numbers for every layer', done => {
                testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    assert.deepStrictEqual(layergroup.metadata.layers[0].meta.dates_as_numbers, ['date']);
                    assert.deepStrictEqual(layergroup.metadata.layers[1].meta.dates_as_numbers, ['date']);
                });

                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    assert.ifError(err);
                    const expected0 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0, date: 1527810000 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1, date: 1527900000 }
                        }
                    ];
                    const expected1 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0, date: 1527810000 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1, date: 1527900000 }
                        }
                    ];
                    const actual0 = JSON.parse(mvt.toGeoJSONSync(0)).features;
                    const actual1 = JSON.parse(mvt.toGeoJSONSync(1)).features;

                    assert.deepStrictEqual(actual0, expected0);
                    assert.deepStrictEqual(actual1, expected1);
                    done();
                });
            });
        });

        describe('and only one layers has the "dates_as_numbers" option enabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({
                    numberOfLayers: 2,
                    layerOptions: [
                        { dates_as_numbers: false },
                        { dates_as_numbers: true }
                    ]
                });
                testClient = new TestClient(mapConfig);
            });

            it('should return dates as numbers only for the layer with the "dates_as_numbers" flag enabled', done => {
                testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    assert.deepStrictEqual(layergroup.metadata.layers[0].meta.dates_as_numbers || [], []);
                    assert.deepStrictEqual(layergroup.metadata.layers[1].meta.dates_as_numbers, ['date']);
                });

                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    assert.ifError(err);
                    const expected0 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1 }
                        }
                    ];
                    const expected1 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0, date: 1527810000 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1, date: 1527900000 }
                        }
                    ];
                    const actual0 = JSON.parse(mvt.toGeoJSONSync(0)).features;
                    const actual1 = JSON.parse(mvt.toGeoJSONSync(1)).features;

                    assert.deepStrictEqual(actual0, expected0);
                    assert.deepStrictEqual(actual1, expected1);
                    done();
                });
            });
        });

        describe('and none of the layers has the "dates_as_numbers" option enabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({
                    numberOfLayers: 2,
                    layerOptions: [
                        { dates_as_numbers: false },
                        { dates_as_numbers: false }
                    ]
                });
                testClient = new TestClient(mapConfig);
            });

            it('should return dates as dates for both layers', done => {
                testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    assert.deepStrictEqual(layergroup.metadata.layers[0].meta.dates_as_numbers || [], []);
                    assert.deepStrictEqual(layergroup.metadata.layers[1].meta.dates_as_numbers || [], []);
                });

                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    assert.ifError(err);
                    const expected0 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1 }
                        }
                    ];
                    const expected1 = [
                        {
                            type: 'Feature',
                            id: 0,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0 }
                        },
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1 }
                        }
                    ];
                    const actual0 = JSON.parse(mvt.toGeoJSONSync(0)).features;
                    const actual1 = JSON.parse(mvt.toGeoJSONSync(1)).features;

                    assert.deepStrictEqual(actual0, expected0);
                    assert.deepStrictEqual(actual1, expected1);
                    done();
                });
            });
        });
    });

    describe('when sql queries use mapnik tokens', () => {
        beforeEach(() => {
            const mapConfig = mapConfigFactory.getVectorMapConfig({
                layerOptions: [{
                    dates_as_numbers: true,
                    additionalColumns: [
                        '!scale_denominator! AS sc'
                    ]
                }]
            });
            testClient = new TestClient(mapConfig);
        });

        afterEach(done => testClient.drain(done));

        it('should work', done => {
            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.deepStrictEqual(layergroup.metadata.layers[0].meta.dates_as_numbers, ['date']);
                done();
            });
        });

        it('should return correct tiles', done => {
            testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                assert.ifError(err);
                const expected = [
                    {
                        type: 'Feature',
                        id: 0,
                        geometry: { type: 'Point', coordinates: [0, 0] },
                        properties: { cartodb_id: 0, date: 1527810000, sc: 559082264.0287178839788058162356 }
                    },
                    {
                        type: 'Feature',
                        id: 1,
                        geometry: { type: 'Point', coordinates: [0, 0] },
                        properties: { cartodb_id: 1, date: 1527900000, sc: 559082264.0287178839788058162356 }
                    }
                ];
                const actual = JSON.parse(mvt.toGeoJSONSync(0)).features;
                assert.deepStrictEqual(actual, expected);
                done();
            });
        });
    });
});
