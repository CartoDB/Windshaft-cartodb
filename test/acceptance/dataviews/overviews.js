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
            test_avg: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'avg'
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
            }
        ]
    };

    it("should expose a sum formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_sum', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"sum","result":15,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    it("should expose an avg formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_avg', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"avg","result":3,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    it("should expose a count formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_count', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"count","result":5,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    it("should expose a max formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_max', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"max","result":5,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    it("should expose a min formula", function(done) {
        var testClient = new TestClient(overviewsMapConfig);
        testClient.getDataview('test_min', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"min","result":1,"nulls":0,"type":"formula"});

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
            assert.deepEqual(formula_result, {"operation":"sum","result":15,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    describe('filters', function() {

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
                    assert.deepEqual(formula_result, {"operation":"sum","result":1,"nulls":0,"type":"formula"});
                    testClient.drain(done);
                });
            });

            it("should expose a filtered  avg formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_avg', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {"operation":"avg","result":1,"nulls":0,"type":"formula"});

                    testClient.drain(done);
                });
            });

            it("should expose a filtered count formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_count', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {"operation":"count","result":1,"nulls":0,"type":"formula"});

                    testClient.drain(done);
                });
            });

            it("should expose a filterd max formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_max', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {"operation":"max","result":1,"nulls":0,"type":"formula"});

                    testClient.drain(done);
                });
            });

            it("should expose a filterd min formula", function(done) {
                var testClient = new TestClient(overviewsMapConfig);
                testClient.getDataview('test_min', params, function(err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {"operation":"min","result":1,"nulls":0,"type":"formula"});

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
                    assert.deepEqual(formula_result, {"operation":"sum","result":1,"nulls":0,"type":"formula"});
                    testClient.drain(done);
                });
            });


        });

    });
});
