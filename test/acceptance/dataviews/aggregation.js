'use strict';

require('../../support/test_helper');
var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('aggregations happy cases', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    function aggregationOperationMapConfig(operation, query, column, aggregationColumn) {
        column = column || 'adm0name';
        aggregationColumn = aggregationColumn || 'pop_max';
        query = query || 'select * from populated_places_simple_reduced';

        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: query,
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        widgets: {}
                    }
                }
            ]
        };

        mapConfig.layers[0].options.widgets[column] = {
            type: 'aggregation',
            options: {
                column: column,
                aggregation: operation,
                aggregationColumn: aggregationColumn
            }
        };

        return mapConfig;
    }

    var operations = ['count', 'sum', 'avg', 'max', 'min'];

    operations.forEach(function(operation) {
        it('should be able to use "' + operation + '" as aggregation operation', function(done) {

            this.testClient = new TestClient(aggregationOperationMapConfig(operation));
            this.testClient.getDataview('adm0name', { own_filter: 0 }, function (err, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);

                assert.equal(aggregation.type, 'aggregation');
                assert.equal(aggregation.aggregation, operation);

                done();
            });
        });
    });

    var query = [
        'select 1 as val, \'a\' as cat, ST_Transform(ST_SetSRID(ST_MakePoint(0,0),4326),3857) as the_geom_webmercator',
        'select null, \'b\', ST_Transform(ST_SetSRID(ST_MakePoint(0,1),4326),3857)',
        'select null, \'b\', ST_Transform(ST_SetSRID(ST_MakePoint(1,0),4326),3857)',
        'select null, null, ST_Transform(ST_SetSRID(ST_MakePoint(1,1),4326),3857)'
    ].join(' UNION ALL ');

    operations.forEach(function (operation) {
        var description = 'should handle NULL values in category and aggregation columns using "' +
            operation + '" as aggregation operation';

        it(description, function (done) {
            this.testClient = new TestClient(aggregationOperationMapConfig(operation, query, 'cat', 'val'));
            this.testClient.getDataview('cat', { own_filter: 0 }, function (err, aggregation) {
                assert.ifError(err);

                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');
                assert.ok(aggregation.categories);
                assert.equal(aggregation.categoriesCount, 3);
                assert.equal(aggregation.count, 4);
                assert.equal(aggregation.nulls, 1);

                var hasNullCategory = false;
                aggregation.categories.forEach(function (category) {
                    if (category.category === null) {
                        hasNullCategory = true;
                    }
                });

                assert.ok(!hasNullCategory, 'aggregation has category NULL');
                done();
            });
        });
    });

    var operations_and_values = {'count': 9, 'sum': 45, 'avg': 5, 'max': 9, 'min': 1};

    var query_other = [
        'select generate_series(1,3) as val, \'other_a\' as cat, NULL as the_geom_webmercator',
        'select generate_series(4,6) as val, \'other_b\' as cat, NULL as the_geom_webmercator',
        'select generate_series(7,9) as val, \'other_c\' as cat, NULL as the_geom_webmercator',
        'select generate_series(10,12) as val, \'category_1\' as cat, NULL as the_geom_webmercator',
        'select generate_series(10,12) as val, \'category_2\' as cat, NULL as the_geom_webmercator',
        'select generate_series(10,12) as val, \'category_3\' as cat, NULL as the_geom_webmercator',
        'select generate_series(10,12) as val, \'category_4\' as cat, NULL as the_geom_webmercator',
        'select generate_series(10,12) as val, \'category_5\' as cat, NULL as the_geom_webmercator'
    ].join(' UNION ALL ');

    Object.keys(operations_and_values).forEach(function (operation) {
        var description = 'should aggregate OTHER category using "' + operation + '"';

        it(description, function (done) {
            this.testClient = new TestClient(aggregationOperationMapConfig(operation, query_other, 'cat', 'val'));
            this.testClient.getDataview('cat', { own_filter: 0 }, function (err, aggregation) {
                assert.ifError(err);

                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');
                assert.ok(aggregation.categories);
                assert.equal(aggregation.categoriesCount, 8);
                assert.equal(aggregation.count, 24);
                assert.equal(aggregation.nulls, 0);

                var aggregated_categories = aggregation.categories.filter( function(category) {
                    return category.agg === true;
                });
                assert.equal(aggregated_categories.length, 1);
                assert.equal(aggregated_categories[0].value, operations_and_values[operation]);

                done();
            });
        });
    });

    var widgetSearchExpects = {
        'count': [ { category: 'other_a', value: 3 } ],
        'sum': [ { category: 'other_a', value: 6 } ],
        'avg': [ { category: 'other_a', value: 2 } ],
        'max': [ { category: 'other_a', value: 3 } ],
        'min': [ { category: 'other_a', value: 1 } ]
    };

    Object.keys(operations_and_values).forEach(function (operation) {
        var description = 'should search OTHER category using "' + operation + '"';

        it(description, function (done) {
            this.testClient = new TestClient(aggregationOperationMapConfig(operation, query_other, 'cat', 'val'));
            this.testClient.widgetSearch('cat', 'other_a', function (err, res, searchResult) {
                assert.ifError(err);

                assert.ok(searchResult);
                assert.equal(searchResult.type, 'aggregation');

                assert.equal(searchResult.categories.length, 1);
                assert.deepEqual(
                    searchResult.categories,
                    widgetSearchExpects[operation]
                );
                done();
            });
        });
    });
});

describe('aggregation-dataview: special float values', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    function createMapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var mapConfig = createMapConfig(
        [
            {
                "type": "cartodb",
                "options": {
                    "source": {
                        "id": "a0"
                    },
                    "cartocss": "#points { marker-width: 10; marker-fill: red; }",
                    "cartocss_version": "2.3.0"
                }
            }
        ],
        {
            val_aggregation: {
                source: {
                    id: 'a0'
                },
                type: 'aggregation',
                options: {
                    column: 'cat',
                    aggregation: 'avg',
                    aggregationColumn: 'val'
                }
            },
            sum_aggregation_numeric: {
                source: {
                    id: 'a1'
                },
                type: 'aggregation',
                options: {
                    column: 'cat',
                    aggregation: 'sum',
                    aggregationColumn: 'val'
                }
            }
        },
        [
            {
                "id": "a0",
                "type": "source",
                "params": {
                    "query": [
                        'SELECT',
                        '  null::geometry the_geom_webmercator,',
                        '  CASE',
                        '    WHEN x % 4 = 0 THEN \'infinity\'::float',
                        '    WHEN x % 4 = 1 THEN \'-infinity\'::float',
                        '    WHEN x % 4 = 2 THEN \'NaN\'::float',
                        '    ELSE x',
                        '  END AS val,',
                        '  CASE',
                        '    WHEN x % 2 = 0 THEN \'category_1\'',
                        '    ELSE \'category_2\'',
                        '  END AS cat',
                        'FROM generate_series(1, 1000) x'
                    ].join('\n')
                }
            }, {
                "id": "a1",
                "type": "source",
                "params": {
                    "query": [
                        'SELECT',
                        '  null::geometry the_geom_webmercator,',
                        '  CASE',
                        '    WHEN x % 3 = 0 THEN \'NaN\'::numeric',
                        '    WHEN x % 3 = 1 THEN x',
                        '    ELSE x',
                        '  END AS val,',
                        '  CASE',
                        '    WHEN x % 2 = 0 THEN \'category_1\'',
                        '    ELSE \'category_2\'',
                        '  END AS cat',
                        'FROM generate_series(1, 1000) x'
                    ].join('\n')
                }
            }
        ]
    );

    // Source a0
    // -----------------------------------------------
    // the_geom_webmercator  |    val    |    cat
    // ----------------------+-----------+------------
    //                       | -Infinity | category_2
    //                       |       NaN | category_1
    //                       |         3 | category_2
    //                       |  Infinity | category_1
    //                       | -Infinity | category_2
    //                       |       NaN | category_1
    //                       |         7 | category_2
    //                       |  Infinity | category_1
    //                       | -Infinity | category_2
    //                       |       NaN | category_1
    //                       |        11 | category_2
    //                       |         " |          "

    var filters = [{ own_filter: 0 }, {}];
    filters.forEach(function (filter) {
        it('should handle special float values using filter: ' + JSON.stringify(filter), function(done) {
            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('val_aggregation', filter, function(err, dataview) {
                assert.ifError(err);
                assert.ok(dataview.infinities === (250 + 250));
                assert.ok(dataview.nans === 250);
                assert.ok(dataview.categories.length === 1);
                dataview.categories.forEach(function (category) {
                    assert.ok(category.category === 'category_2');
                    assert.ok(category.value === 501);
                });
                done();
            });
        });

        it('should handle special numeric values using filter: ' + JSON.stringify(filter), function(done) {
            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('sum_aggregation_numeric', filter, function(err, dataview) {
                assert.ifError(err);
                assert.ok(dataview.nans === 333);
                assert.ok(dataview.categories.length === 2);
                dataview.categories.forEach(function (category) {
                    assert.ok(category.value !== null);
                });
                done();
            });
        });
    });
});

describe('aggregation dataview tuned by categories query param', function () {
    const mapConfig = {
        version: '1.5.0',
        layers: [
            {
                type: "cartodb",
                options: {
                    source: {
                        "id": "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
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
                id: "a0",
                type: "source",
                params: {
                    query: `
                        SELECT
                            null::geometry the_geom_webmercator,
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
                        FROM generate_series(1, 1000) x
                    `
                }
            }
        ]
    };

    beforeEach(function () {
        this.testClient = new TestClient(mapConfig, 1234);
    });

    afterEach(function (done) {
        this.testClient.drain(done);
    });

    var scenarios = [
        {
            params: { own_filter: 0, categories: -1 },
            categoriesExpected: 4
        },
        {
            params: { own_filter: 0, categories: 0 },
            categoriesExpected: 4
        },
        {
            params: { own_filter: 0, categories: 1 },
            categoriesExpected: 1
        },
        {
            params: { own_filter: 0, categories: 2 },
            categoriesExpected: 2
        },
        {
            params: { own_filter: 0, categories: 4 },
            categoriesExpected: 4
        },
        {
            params: { own_filter: 0, categories: 5 },
            categoriesExpected: 4
        }
    ];

    scenarios.forEach(function (scenario) {
        it(`should handle cartegories to customize aggregations: ${JSON.stringify(scenario.params)}`, function (done) {
            this.testClient.getDataview('categories', scenario.params, (err, dataview) => {
                assert.ifError(err);
                assert.equal(dataview.categories.length, scenario.categoriesExpected);
                done();
            });
        });
    });
});



describe('Count aggregation', function () {
    const mapConfig = {
        version: '1.5.0',
        layers: [
            {
                type: "cartodb",
                options: {
                    source: {
                        "id": "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
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
                    aggregation: 'count'
                }
            }
        },
        analyses: [
            {
                id: "a0",
                type: "source",
                params: {
                    query: `
                        SELECT
                            null::geometry the_geom_webmercator,
                            CASE
                                WHEN x % 4 = 0 THEN 1
                                WHEN x % 4 = 1 THEN 2
                                WHEN x % 4 = 2 THEN 3
                                ELSE null
                            END AS val,
                            CASE
                                WHEN x % 4 = 0 THEN 'category_1'
                                WHEN x % 4 = 1 THEN 'category_2'
                                WHEN x % 4 = 2 THEN 'category_3'
                                ELSE null
                            END AS cat
                        FROM generate_series(1, 1000) x
                    `
                }
            }
        ]
    };

    it(`should handle null values correctly when aggregationColumn isn't provided`, function (done) {
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('categories', { own_filter: 0, categories: 0 }, (err, dataview) => {
            assert.ifError(err);
            assert.equal(dataview.categories.length, 3);
            this.testClient.drain(done);
        });
    });

    it(`should handle null values correctly when aggregationColumn is provided`, function (done) {
        mapConfig.dataviews.categories.options.aggregationColumn = 'val';
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('categories', { own_filter: 0, categories: 0 }, (err, dataview) => {
            assert.ifError(err);
            assert.equal(dataview.categories.length, 3);
            this.testClient.drain(done);
        });
    });
});
