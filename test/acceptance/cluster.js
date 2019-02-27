'use strict';

require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const POINTS_SQL_1 = `
    select
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
`;

const defaultLayers = [{
    type: 'cartodb',
    options: {
        sql: POINTS_SQL_1,
        aggregation: {
            threshold: 1
        }
    }
}];

function createVectorMapConfig (layers = defaultLayers) {
    return {
        version: '1.8.0',
        layers: layers
    };
}

describe('cluster', function () {
    describe('resolution = 1', function () {
        const suite = [
            {
                cartodb_id: 1,
                expected: [ { cartodb_id: 1, value: -3 } ]
            },
            {
                cartodb_id: 2,
                expected: [ { cartodb_id: 2, value: -2 } ]
            },
            {
                cartodb_id: 3,
                expected: [ { cartodb_id: 3, value: -1 } ]
            },
            {
                cartodb_id: 4,
                expected: [ { cartodb_id: 4, value: 0 } ]
            },
            {
                cartodb_id: 5,
                expected: [ { cartodb_id: 5, value: 1 } ]
            },
            {
                cartodb_id: 6,
                expected: [ { cartodb_id: 6, value: 2 } ]
            }
        ];

        suite.forEach(({ cartodb_id, expected }) => {
            it(`should get just one disaggregated feature: cartodb_id = ${cartodb_id}`, function (done) {
                const mapConfig = createVectorMapConfig();
                const testClient = new TestClient(mapConfig);
                const zoom = 0;
                const clusterId = cartodb_id;
                const layerId = 0;
                const params = {};

                testClient.getClusterFeatures(zoom, clusterId, layerId, params, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepStrictEqual(body.rows, expected);
                    testClient.drain(done);
                });
            });
        });
    });

    describe('resolution = 50', function () {
        const suite = [
            {
                cartodb_id: 1,
                resolution: 50,
                expected: [
                    { cartodb_id: 1, value: -3 },
                    { cartodb_id: 2, value: -2 },
                    { cartodb_id: 3, value: -1 },
                    { cartodb_id: 4, value: 0 },
                ]
            },
            {
                cartodb_id: 5,
                resolution: 50,
                expected: [
                    { cartodb_id: 5, value: 1 },
                    { cartodb_id: 6, value: 2 },
                    { cartodb_id: 7, value: 3 }
                ]
            }
        ];

        suite.forEach(({ cartodb_id, resolution, expected }) => {
            it(`should get just one disaggregated feature: cartodb_id = ${cartodb_id}`, function (done) {
                const mapConfig = createVectorMapConfig([{
                    type: 'cartodb',
                    options: {
                        sql: POINTS_SQL_1,
                        aggregation: {
                            threshold: 1,
                            resolution: resolution
                        }
                    }
                }]);

                const testClient = new TestClient(mapConfig);
                const zoom = 0;
                const clusterId = cartodb_id;
                const layerId = 0;
                const params = {};

                testClient.getClusterFeatures(zoom, clusterId, layerId, params, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepStrictEqual(body.rows, expected);
                    testClient.drain(done);
                });
            });
        });
    });
});
