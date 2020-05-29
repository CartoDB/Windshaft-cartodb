'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const POINTS_SQL_1 = `
    select
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10 + 18, x*10 + 5), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10 + 18, x*10 + 5), 4326), 3857) as the_geom_webmercator,
        x as value,
        CASE
            WHEN x % 2 = 0 THEN 'even'
            ELSE 'odd'
        END AS type
    from generate_series(-3, 3) x
    order by cartodb_id asc
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
    describe('w/o aggregation', function () {
        it('should return error while fetching disaggregated features', function (done) {
            const mapConfig = createVectorMapConfig([{
                type: 'cartodb',
                options: {
                    sql: POINTS_SQL_1,
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]);
            const testClient = new TestClient(mapConfig);
            const zoom = 0;
            const cartodbId = 1;
            const layerId = 0;
            const params = {
                response: {
                    status: 400
                }
            };

            testClient.getClusterFeatures(zoom, cartodbId, layerId, params, (err, body) => {
                if (err) {
                    return done(err);
                }

                assert.deepStrictEqual(body, {
                    errors: ['Map f105928729b4d3f67ae3578a163778c9 has no aggregation defined for layer 0'],
                    errors_with_context: [
                        {
                            layer: {
                                index: '0',
                                type: 'cartodb'
                            },
                            message: 'Map f105928729b4d3f67ae3578a163778c9 has no aggregation defined for layer 0',
                            subtype: 'aggregation',
                            type: 'layer'
                        }
                    ]
                });

                testClient.drain(done);
            });
        });

        it('with aggregation disabled should return error while fetching disaggregated features', function (done) {
            const mapConfig = createVectorMapConfig([{
                type: 'cartodb',
                options: {
                    sql: POINTS_SQL_1,
                    aggregation: false
                }
            }]);
            const testClient = new TestClient(mapConfig);
            const zoom = 0;
            const cartodbId = 1;
            const layerId = 0;
            const params = {
                response: {
                    status: 400
                }
            };

            testClient.getClusterFeatures(zoom, cartodbId, layerId, params, (err, body) => {
                if (err) {
                    return done(err);
                }

                assert.deepStrictEqual(body, {
                    errors: ['Map 9d19316644f831332b44de7b3158aa77 has no aggregation defined for layer 0'],
                    errors_with_context: [
                        {
                            layer: {
                                index: '0',
                                type: 'cartodb'
                            },
                            message: 'Map 9d19316644f831332b44de7b3158aa77 has no aggregation defined for layer 0',
                            subtype: 'aggregation',
                            type: 'layer'
                        }
                    ]
                });

                testClient.drain(done);
            });
        });
    });

    describe('fetch features within a cluster grid', function () {
        const suite = [
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 0.5,
                expected: [{ cartodb_id: 1, value: -3, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 2,
                resolution: 0.5,
                expected: [{ cartodb_id: 2, value: -2, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 3,
                resolution: 0.5,
                expected: [{ cartodb_id: 3, value: -1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 4,
                resolution: 0.5,
                expected: [{ cartodb_id: 4, value: 0, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 0.5,
                expected: [{ cartodb_id: 5, value: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 6,
                resolution: 0.5,
                expected: [{ cartodb_id: 6, value: 2, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 7,
                resolution: 0.5,
                expected: [{ cartodb_id: 7, value: 3, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                expected: [{ cartodb_id: 1, value: -3, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 2,
                resolution: 1,
                expected: [{ cartodb_id: 2, value: -2, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 3,
                resolution: 1,
                expected: [{ cartodb_id: 3, value: -1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 4,
                resolution: 1,
                expected: [{ cartodb_id: 4, value: 0, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 1,
                expected: [{ cartodb_id: 5, value: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 6,
                resolution: 1,
                expected: [{ cartodb_id: 6, value: 2, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 7,
                resolution: 1,
                expected: [{ cartodb_id: 7, value: 3, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 50,
                expected: [
                    { cartodb_id: 1, value: -3, type: 'odd' },
                    { cartodb_id: 2, value: -2, type: 'even' }
                ]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 50,
                expected: [
                    { cartodb_id: 4, value: 0, type: 'even' },
                    { cartodb_id: 5, value: 1, type: 'odd' },
                    { cartodb_id: 6, value: 2, type: 'even' },
                    { cartodb_id: 7, value: 3, type: 'odd' }
                ]
            },
            {
                zoom: 1,
                cartodb_id: 1,
                resolution: 1,
                expected: [{ cartodb_id: 1, value: -3, type: 'odd' }]
            },
            {
                zoom: 1,
                cartodb_id: 2,
                resolution: 1,
                expected: [{ cartodb_id: 2, value: -2, type: 'even' }]
            },
            {
                zoom: 1,
                cartodb_id: 3,
                resolution: 1,
                expected: [{ cartodb_id: 3, value: -1, type: 'odd' }]
            },
            {
                zoom: 1,
                cartodb_id: 4,
                resolution: 1,
                expected: [{ cartodb_id: 4, value: 0, type: 'even' }]
            },
            {
                zoom: 1,
                cartodb_id: 5,
                resolution: 1,
                expected: [{ cartodb_id: 5, value: 1, type: 'odd' }]
            },
            {
                zoom: 1,
                cartodb_id: 6,
                resolution: 1,
                expected: [{ cartodb_id: 6, value: 2, type: 'even' }]
            },
            {
                zoom: 1,
                cartodb_id: 7,
                resolution: 1,
                expected: [{ cartodb_id: 7, value: 3, type: 'odd' }]
            },
            {
                zoom: 1,
                cartodb_id: 1,
                resolution: 50,
                expected: [
                    { cartodb_id: 1, value: -3, type: 'odd' },
                    { cartodb_id: 2, value: -2, type: 'even' }
                ]
            },
            {
                zoom: 1,
                cartodb_id: 5,
                resolution: 50,
                expected: [
                    { cartodb_id: 4, value: 0, type: 'even' },
                    { cartodb_id: 5, value: 1, type: 'odd' }
                ]
            }
        ];

        suite.forEach(({ zoom, cartodb_id: cartodbId, resolution, expected }) => {
            const description = `should get features for z: ${zoom} cartodb_id: ${cartodbId}, res: ${resolution}`;
            it(description, function (done) {
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
                const layerId = 0;
                const params = {};

                testClient.getClusterFeatures(zoom, cartodbId, layerId, params, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepStrictEqual(body.rows, expected);
                    testClient.drain(done);
                });
            });
        });
    });

    describe('valid aggregation input', function () {
        const suite = [
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 2,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 3,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 4,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 6,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'even' }]
            },
            {
                zoom: 0,
                cartodb_id: 7,
                resolution: 1,
                aggregation: { columns: ['type'] },
                expected: [{ _cdb_feature_count: 1, type: 'odd' }]
            },
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 50,
                aggregation: { columns: ['type'] },
                expected: [
                    { _cdb_feature_count: 1, type: 'even' },
                    { _cdb_feature_count: 1, type: 'odd' }
                ]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 50,
                aggregation: { columns: ['type'] },
                expected: [
                    { _cdb_feature_count: 2, type: 'even' },
                    { _cdb_feature_count: 2, type: 'odd' }
                ]
            },
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'odd', max_value: -3 }]
            },
            {
                zoom: 0,
                cartodb_id: 2,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'even', max_value: -2 }]
            },
            {
                zoom: 0,
                cartodb_id: 3,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'odd', max_value: -1 }]
            },
            {
                zoom: 0,
                cartodb_id: 4,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'even', max_value: 0 }]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'odd', max_value: 1 }]
            },
            {
                zoom: 0,
                cartodb_id: 6,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'even', max_value: 2 }]
            },
            {
                zoom: 0,
                cartodb_id: 7,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [{ _cdb_feature_count: 1, type: 'odd', max_value: 3 }]
            },
            {
                zoom: 0,
                cartodb_id: 1,
                resolution: 50,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [
                    { _cdb_feature_count: 1, type: 'even', max_value: -2 },
                    { _cdb_feature_count: 1, type: 'odd', max_value: -3 }
                ]
            },
            {
                zoom: 0,
                cartodb_id: 5,
                resolution: 50,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: [
                    { _cdb_feature_count: 2, type: 'even', max_value: 2 },
                    { _cdb_feature_count: 2, type: 'odd', max_value: 3 }
                ]
            }
        ];

        suite.forEach(({ zoom, cartodb_id: cartodbId, resolution, aggregation, expected }) => {
            it(`should aggregate by type; z: ${zoom}, cartodb_id: ${cartodbId}, res: ${resolution}`, function (done) {
                const mapConfig = createVectorMapConfig([{
                    type: 'cartodb',
                    options: {
                        sql: POINTS_SQL_1,
                        aggregation: {
                            threshold: 1,
                            resolution
                        }
                    }
                }]);
                const testClient = new TestClient(mapConfig);
                const layerId = 0;
                const params = { aggregation };

                testClient.getClusterFeatures(zoom, cartodbId, layerId, params, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    const sortFn = (a, b) => {
                        return (a._cdb_feature_count < b._cdb_feature_count) ||
                               (a._cdb_feature_count === b._cdb_feature_count &&
                                    (a.type < b.type ||
                                     (a.type === b.type && a.max_value < b.max_value)));
                    };

                    assert.deepStrictEqual(body.rows.sort(sortFn), expected.sort(sortFn));

                    testClient.drain(done);
                });
            });
        });
    });

    describe('invalid aggregation input', function () {
        const expectedColumnsError = {
            errors: ['Invalid aggregation input, columns should be and array of column names'],
            errors_with_context: [
                {
                    layer: {
                        index: '0',
                        type: 'cartodb'
                    },
                    message: 'Invalid aggregation input, columns should be and array of column names',
                    subtype: 'aggregation',
                    type: 'layer'
                }
            ]
        };

        const expectedExpressionsError = {
            errors: ['Invalid aggregation input, expressions should be and object with valid functions'],
            errors_with_context: [
                {
                    layer: {
                        index: '0',
                        type: 'cartodb'
                    },
                    message: 'Invalid aggregation input, expressions should be and object with valid functions',
                    subtype: 'aggregation',
                    type: 'layer'
                }
            ]
        };

        const invalidFunctionExpressionsError = {
            errors: ['function wadus(integer) does not exist'],
            errors_with_context: [
                {
                    message: 'function wadus(integer) does not exist',
                    type: 'unknown'
                }
            ]
        };

        const invalidColumnExpressionsError = {
            errors: ['column "wadus" does not exist'],
            errors_with_context: [
                {
                    message: 'column "wadus" does not exist',
                    type: 'unknown'
                }
            ]
        };

        const expectedAggregatedColumnError = {
            errors: ['Invalid aggregation input, aggregated column should be an string'],
            errors_with_context: [
                {
                    layer: {
                        index: '0',
                        type: 'cartodb'
                    },
                    message: 'Invalid aggregation input, aggregated column should be an string',
                    subtype: 'aggregation',
                    type: 'layer'
                }
            ]
        };

        const expectedAggregateFunctionError = {
            errors: ['Invalid aggregation input, aggregate function should be an string'],
            errors_with_context: [
                {
                    layer: {
                        index: '0',
                        type: 'cartodb'
                    },
                    message: 'Invalid aggregation input, aggregate function should be an string',
                    subtype: 'aggregation',
                    type: 'layer'
                }
            ]
        };

        const suite = [
            {
                description: 'empty aggregation object should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {},
                expected: expectedColumnsError
            },
            {
                description: 'empty aggregation array should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: [],
                expected: expectedColumnsError
            },
            {
                description: 'aggregation as string should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: 'wadus',
                expected: expectedColumnsError
            },
            {
                description: 'empty columns array should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: [] },
                expected: expectedColumnsError
            },
            {
                description: 'empty columns object should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: {} },
                expected: expectedColumnsError
            },
            {
                description: 'columns as string should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: 'wadus' },
                expected: expectedColumnsError
            },
            {
                description: 'columns as null should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: null },
                expected: expectedColumnsError
            },
            {
                description: 'empty expressions array should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: ['type'], expressions: [] },
                expected: expectedExpressionsError
            },
            {
                description: 'empty expressions number should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: ['type'], expressions: 1 },
                expected: expectedExpressionsError
            },
            {
                description: 'expressions as string should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: ['type'], expressions: 'wadus' },
                expected: expectedExpressionsError
            },
            {
                description: 'expressions as null should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: { columns: ['type'], expressions: null },
                expected: expectedExpressionsError
            },
            {
                description: 'invalid aggregation function should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'wadus',
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: invalidFunctionExpressionsError
            },
            {
                description: 'invalid aggregation column should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 'wadus'
                        }
                    }
                },
                status: 404,
                expected: invalidColumnExpressionsError
            },
            {
                description: 'aggregated column as non string should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 'max',
                            aggregated_column: 1
                        }
                    }
                },
                expected: expectedAggregatedColumnError
            },
            {
                description: 'aggregate function as non string should respond with error',
                zoom: 0,
                cartodb_id: 1,
                resolution: 1,
                aggregation: {
                    columns: ['type'],
                    expressions: {
                        max_value: {
                            aggregate_function: 1,
                            aggregated_column: 'value'
                        }
                    }
                },
                expected: expectedAggregateFunctionError
            }
        ];

        suite.forEach(({ description, zoom, cartodb_id: cartodbId, resolution, aggregation, expected, status = 400 }) => {
            it(description, function (done) {
                const mapConfig = createVectorMapConfig([{
                    type: 'cartodb',
                    options: {
                        sql: POINTS_SQL_1,
                        aggregation: {
                            threshold: 1,
                            resolution
                        }
                    }
                }]);
                const testClient = new TestClient(mapConfig);
                const layerId = 0;
                const params = {
                    response: { status },
                    aggregation
                };

                testClient.getClusterFeatures(zoom, cartodbId, layerId, params, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepStrictEqual(body, expected);

                    testClient.drain(done);
                });
            });
        });
    });
});
