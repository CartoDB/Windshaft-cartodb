/* eslint-env mocha */
const assert = require('assert');
const TestClient = require('../support/test-client');
const mapConfigFactory = require('../fixtures/test_mapconfigFactory');

describe('date-wrapping', () => {
    let testClient;

    describe('when a map instantiation has one single layer', () => {
        describe('and the layer has the "dates_as_numbers" option enabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({ dates_as_numbers: true });
                testClient = new TestClient(mapConfig);
            });

            afterEach(done => testClient.drain(done));

            it('should return date columns casted as numbers', done => {

                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    const expected = [
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0, date: 1527810000 }
                        },
                        {
                            type: 'Feature',
                            id: 2,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1, date: 1527900000 }
                        }
                    ];
                    const actual = JSON.parse(mvt.toGeoJSONSync(0)).features;

                    assert.deepEqual(actual, expected);
                    done();
                });
            });

            it('should return metadata with casted columns', done => {

                testClient.getLayergroup(function(err, layergroup) {
                    assert.ifError(err);
                    assert.deepEqual(layergroup.metadata.layers[0].meta.dates_as_numbers, ['date']);
                    testClient.drain(done);
                });

            });

        });

        describe('and the layer has the "dates_as_numbers" option disabled', () => {
            beforeEach(() => {
                const mapConfig = mapConfigFactory.getVectorMapConfig({ dates_as_numbers: false });
                testClient = new TestClient(mapConfig);
            });

            afterEach(done => testClient.drain(done));

            it('should return date columns as dates', done => {

                testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, mvt) => {
                    const expected = [
                        {
                            type: 'Feature',
                            id: 1,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 0 }
                        },
                        {
                            type: 'Feature',
                            id: 2,
                            geometry: { type: 'Point', coordinates: [0, 0] },
                            properties: { _cdb_feature_count: 1, cartodb_id: 1 }
                        }
                    ];
                    const actual = JSON.parse(mvt.toGeoJSONSync(0)).features;

                    assert.deepEqual(actual, expected);
                    done();
                });
            });
        });
    });


    describe('when a map instantiation has multiple layers', () => {
        beforeEach(() => {
            const mapConfig = mapConfigFactory.getVectorMapConfig({ numberOfLayers: 2 });
            testClient = new TestClient(mapConfig);
        });
        describe('and both layers have the "dates_as_numbers" option enabled', () => {
            // TODO: Pending test
            it('should return dates as numbers for every layer');
        });

        describe('and only one layers has the "dates_as_numbers" option enabled', () => {
            // TODO: Pending test
            it('should return dates as numbers only for the layer with the "dates_as_numbers" flag enabled');
        });

        describe('and none of the layers has the "dates_as_numbers" option enabled', () => {
            // TODO: Pending test
            it('should return dates as dates for both layers');
        });
    });
});