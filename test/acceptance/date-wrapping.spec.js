/* eslint-env mocha */
const assert = require('assert');
const TestClient = require('../support/test-client');
const mapConfigFactory = require('../fixtures/test_mapconfigFactory');

describe.only('date-wrapping', () => {
    let testClient;

    describe('when a map instantiation has the "dates_as_numbers" option enabled', () => {
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
    });

    describe('when a map instantiation has the "dates_as_numbers" option disabled', () => {
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