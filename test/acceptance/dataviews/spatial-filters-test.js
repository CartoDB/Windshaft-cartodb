'use strict';

require('../../support/test-helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

describe('spatial filters', function () {
    const mapConfig = {
        version: '1.8.0',
        layers: [
            {
                type: 'cartodb',
                options: {
                    source: {
                        id: 'a0'
                    },
                    cartocss: '#points { marker-width: 10; marker-fill: red; }',
                    cartocss_version: '2.3.0'
                }
            }
        ],
        dataviews: {
            categories: {
                source: {
                    id: 'a0'
                },
                type: 'aggregation',
                options: {
                    column: 'cat',
                    aggregation: 'sum',
                    aggregationColumn: 'val'
                }
            }
        },
        analyses: [
            {
                id: 'a0',
                type: 'source',
                params: {
                    query: `
                        SELECT
                            ST_SetSRID(ST_MakePoint(x, x), 4326) as the_geom,
                            ST_Transform(ST_SetSRID(ST_MakePoint(x, x), 4326), 3857) as the_geom_webmercator,
                            CASE
                                WHEN x % 4 = 0 THEN 1
                                WHEN x % 4 = 1 THEN 2
                                WHEN x % 4 = 2 THEN 3
                                ELSE 4
                            END AS val,
                            CASE
                                WHEN x % 4 = 0 THEN 'category_1'
                                WHEN x % 4 = 1 THEN 'category_2'
                                WHEN x % 4 = 2 THEN 'category_3'
                                ELSE 'category_4'
                            END AS cat
                        FROM generate_series(-10, 10) x
                    `
                }
            }
        ]
    };

    beforeEach(function (done) {
        const apikey = 1234;
        this.testClient = new TestClient(mapConfig, apikey);
        done();
    });

    afterEach(function (done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    const scenarios = [
        {
            params: JSON.stringify({}),
            expected: {
                type: 'aggregation',
                aggregation: 'sum',
                count: 21,
                nulls: 0,
                nans: 0,
                infinities: 0,
                min: 5,
                max: 40,
                categoriesCount: 4,
                categories: [
                    { category: 'category_4', value: 40, agg: false },
                    { category: 'category_3', value: 9, agg: false },
                    { category: 'category_2', value: 6, agg: false },
                    { category: 'category_1', value: 5, agg: false }
                ]
            }
        },
        {
            params: {
                circle: JSON.stringify({
                    lat: 0,
                    lng: 0,
                    radius: 5000
                })
            },
            expected: {
                type: 'aggregation',
                aggregation: 'sum',
                count: 1,
                nulls: 0,
                nans: 0,
                infinities: 0,
                min: 1,
                max: 1,
                categoriesCount: 1,
                categories: [
                    { category: 'category_1', value: 1, agg: false }
                ]
            }
        },
        {
            params: {
                polygon: JSON.stringify({
                    type: 'Polygon',
                    coordinates: [
                        [
                            [
                                -9.312286,
                                37.907367
                            ],
                            [
                                11.969604,
                                6.487254
                            ],
                            [
                                -32.217407,
                                6.957781
                            ],
                            [
                                -9.312286,
                                37.907367
                            ]
                        ]
                    ]
                })
            },
            expected: {
                type: 'aggregation',
                aggregation: 'sum',
                count: 3,
                nulls: 0,
                nans: 0,
                infinities: 0,
                min: 1,
                max: 4,
                categoriesCount: 3,
                categories: [
                    { category: 'category_4', value: 4, agg: false },
                    { category: 'category_2', value: 2, agg: false },
                    { category: 'category_1', value: 1, agg: false }
                ]
            }
        }
    ];

    scenarios.forEach(function (scenario) {
        it(`should get aggregation dataview with params: ${JSON.stringify(scenario.params)}`, function (done) {
            this.testClient.getDataview('categories', scenario.params, (err, dataview) => {
                assert.ifError(err);
                assert.deepStrictEqual(dataview, scenario.expected);
                done();
            });
        });
    });
});
