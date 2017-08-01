require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('dataviews using tables without overviews', function() {

    var nonOverviewsMapConfig =  {
        version: '1.5.0',
        analyses: [
            { id: 'data-source',
                type: 'source',
                params: {
                  query: 'select * from populated_places_simple_reduced'
                }
            }
        ],
        dataviews:  {
            country_places_count: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'adm0_a3',
                    operation: 'count'
                }
            },
            country_categories: {
                type: 'aggregation',
                source: {id: 'data-source'},
                options: {
                    column: 'adm0_a3',
                    aggregation: 'count'
                }
            }
        },
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    source: { id: 'data-source' }
                }
            }
        ]
    };

    it("should expose a formula", function(done) {
        var testClient = new TestClient(nonOverviewsMapConfig);
        testClient.getDataview('country_places_count', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, { operation: 'count', result: 7313, nulls: 0, type: 'formula' });

            testClient.drain(done);
        });
    });

    it("should admit a bbox", function(done) {
        var params = {
            bbox: "-170,-80,170,80"
        };
        var testClient = new TestClient(nonOverviewsMapConfig);
        testClient.getDataview('country_places_count', params, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, { operation: 'count', result: 7253, nulls: 0, type: 'formula' });

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('category', function () {

            it("should expose a filtered formula", function (done) {
                var params = {
                    filters: {
                        dataviews: {country_categories: {accept: ['CAN']}}
                    }
                };
                var testClient = new TestClient(nonOverviewsMapConfig);
                testClient.getDataview('country_places_count', params, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, { operation: 'count', result: 256, nulls: 0, type: 'formula' });
                    testClient.drain(done);
                });
            });

            it("should expose a filtered formula and admit a bbox", function (done) {
                var params = {
                    filters: {
                        dataviews: {country_categories: {accept: ['CAN']}}
                    },
                    bbox: "-170,-80,170,80"
                };
                var testClient = new TestClient(nonOverviewsMapConfig);
                testClient.getDataview('country_places_count', params, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, { operation: 'count', result: 254, nulls: 0, type: 'formula' });
                    testClient.drain(done);
                });
            });
        });

    });
});

describe('dataviews using tables with overviews', function() {

    var overviewsMapConfig =  {
        version: '1.5.0',
        analyses: [
            { id: 'data-source',
                type: 'source',
                params: {
                  query: 'select * from test_table_overviews'
                }
            },
            {
                id: 'data-source-special-float-values',
                type: 'source',
                params: {
                  query: 'select * from test_special_float_values_table_overviews'
                }
            }
        ],
        dataviews:  {
            test_sum: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'sum'
                }
            },
            test_categories: {
                type: 'aggregation',
                source: {id: 'data-source'},
                options: {
                    column: 'name',
                    aggregation: 'count',
                    aggregationColumn: 'name',
                }
            },
            test_categories_special_values: {
                type: 'aggregation',
                source: {
                    id: 'data-source-special-float-values'
                },
                options: {
                    column: 'name',
                    aggregation: 'sum',
                    aggregationColumn: 'value',
                }
            },
            test_histogram: {
                type: 'histogram',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    bins: 2
                }
            },
            test_histogram_date: {
                type: 'histogram',
                source: {id: 'data-source'},
                options: {
                    column: 'updated_at',
                    bins: 2
                }
            },
            test_histogram_special_values: {
                type: 'histogram',
                source: {
                    id: 'data-source-special-float-values'
                },
                options: {
                    column: 'value',
                    bins: 2
                }
            },
            test_avg: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'avg'
                }
            },
            test_formula_sum_special_values: {
                type: 'formula',
                source: {
                    id: 'data-source-special-float-values'
                },
                options: {
                    column: 'value',
                    operation: 'sum'
                }
            },
            test_count: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'count'
                }
            },
            test_min: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'min'
                }
            },
            test_max: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'max'
                }
            }
        },
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table_overviews',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    source: { id: 'data-source' }
                }
            },
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_special_float_values_table_overviews',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    source: {
                        id: 'data-source-special-float-values'
                    }
                }
            }
        ]
    };

    it("should expose a sum formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_sum', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation":"sum",
                "result":15,
                "infinities": 0,
                "nans": 0,
                "nulls":0,
                "type":"formula"
            });

            testClient.drain(done);
        });
    });

    it("should expose an avg formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_avg', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation":"avg",
                "result":3,
                "nulls":0,
                "type":"formula",
                "infinities": 0,
                "nans": 0
            });

            testClient.drain(done);
        });
    });

    it("should expose a count formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_count', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation":"count",
                "result":5,
                "nulls":0,
                "type":"formula",
                "infinities": 0,
                "nans": 0
            });

            testClient.drain(done);
        });
    });

    it("should expose a max formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_max', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation": "max",
                "result": 5,
                "nulls": 0,
                "infinities": 0,
                "nans": 0,
                "type": "formula"
            });

            testClient.drain(done);
        });
    });

    it("should expose a min formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_min', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation": "min",
                "result": 1,
                "nulls": 0,
                "infinities": 0,
                "nans": 0,
                "type": "formula"
            });

            testClient.drain(done);
        });
    });

    it("should admit a bbox", function(done) {
        var params = {
            bbox: "-170,-80,170,80"
        };
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_sum', params, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {
                "operation":"sum",
                "result":15,
                "nulls":0,
                "infinities": 0,
                "nans": 0,
                "type":"formula"
            });

            testClient.drain(done);
        });
    });

    it("should expose a histogram", function (done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_histogram', function (err, histogram) {
            if (err) {
                return done(err);
            }
            assert.ok(histogram);
            assert.equal(histogram.type, 'histogram');
            assert.ok(Array.isArray(histogram.bins));
            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('histogram', function () {

            it("should expose a filtered histogram", function (done) {
                var params = {
                    filters: {
                        dataviews: { test_histogram: { min: 2 } }
                    }
                };
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_histogram', params, function (err, histogram) {
                    if (err) {
                        return done(err);
                    }
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');
                    assert.ok(Array.isArray(histogram.bins));
                    assert.equal(histogram.bins.length, 4);
                    testClient.drain(done);
                });
            });

            it("should expose a filtered histogram with no results", function (done) {
                var params = {
                    filters: {
                        dataviews: { test_histogram: { max: -1 } }
                    }
                };
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_histogram', params, function (err, histogram) {
                    if (err) {
                        return done(err);
                    }
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');
                    assert.ok(Array.isArray(histogram.bins));
                    assert.equal(histogram.bins.length, 0);
                    testClient.drain(done);
                });
            });

            it("should expose a filtered date histogram with no results", function (done) {
                // This most likely works because the overviews will pass
                // the responsibility to the normal dataviews.
                var params = {
                    filters: {
                        dataviews: { test_histogram_date: { max: -1 } }
                    }
                };
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_histogram_date', params, function (err, histogram) {
                    if (err) {
                        return done(err);
                    }
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');
                    assert.ok(Array.isArray(histogram.bins));
                    assert.equal(histogram.bins.length, 0);
                    testClient.drain(done);
                });
            });
        });

        describe('category', function () {

            var params = {
                filters: {
                    dataviews: {test_categories: {accept: ['Hawai']}}
                }
            };

            it("should expose a filtered sum formula", function (done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_sum', params, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation":"sum",
                        "result":1,
                        "nulls":0,
                        "infinities": 0,
                        "nans": 0,
                        "type":"formula"
                    });
                    testClient.drain(done);
                });
            });

            it("should expose a filtered  avg formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_avg', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation":"avg",
                        "result":1,
                        "nulls":0,
                        "infinities": 0,
                        "nans": 0,
                        "type":"formula"
                    });

                    testClient.drain(done);
                });
            });

            it("should expose a filtered count formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_count', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation":"count",
                        "result":1,
                        "infinities": 0,
                        "nans": 0,
                        "nulls":0,
                        "type":"formula"
                    });

                    testClient.drain(done);
                });
            });

            it("should expose a filterd max formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_max', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation": "max",
                        "result": 1,
                        "nulls": 0,
                        "infinities": 0,
                        "nans": 0,
                        "type": "formula"
                    });

                    testClient.drain(done);
                });
            });

            it("should expose a filterd min formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_min', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation": "min",
                        "result": 1,
                        "nulls": 0,
                        "infinities": 0,
                        "nans": 0,
                        "type": "formula"
                    });

                    testClient.drain(done);
                });
            });

            it("should expose a filtered sum formula with bbox", function (done) {
                var bboxparams = {
                    filters: {
                        dataviews: {test_categories: {accept: ['Hawai']}}
                    },
                    bbox: "-170,-80,170,80"
                };
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_sum', bboxparams, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {
                        "operation":"sum",
                        "result":1,
                        "nulls":0,
                        "infinities": 0,
                        "nans": 0,
                        "type":"formula"
                    });
                    testClient.drain(done);
                });
            });


        });

        describe('aggregation special float values', function () {
            var params = {};

            it("should expose an aggregation dataview filtering special float values out", function (done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_categories_special_values', params, function (err, dataview) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(dataview, {
                        aggregation: 'sum',
                        count: 5,
                        nulls: 0,
                        nans: 1,
                        infinities: 1,
                        min: 6,
                        max: 6,
                        categoriesCount: 1,
                        categories: [ { category: 'Hawai', value: 6, agg: false } ],
                        type: 'aggregation'
                    });
                    testClient.drain(done);
                });
            });

            it('should expose a histogram dataview filtering special float values out', function (done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_histogram_special_values', params, function (err, dataview) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(dataview, {
                        bin_width: 0,
                        bins_count: 1,
                        bins_start: 3,
                        nulls: 0,
                        infinities: 1,
                        nans: 1,
                        avg: 3,
                        bins: [ { bin: 0, min: 3, max: 3, avg: 3, freq: 2 } ],
                        type: 'histogram'
                    });
                    testClient.drain(done);
                });
            });

            it('should expose a formula (sum) dataview filtering special float values out', function (done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_formula_sum_special_values', params, function (err, dataview) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(dataview, {
                        operation: 'sum',
                        result: 6,
                        nulls: 0,
                        nans: 1,
                        infinities: 1,
                        type: 'formula'
                    });
                    testClient.drain(done);
                });
            });
        });
    });
});
