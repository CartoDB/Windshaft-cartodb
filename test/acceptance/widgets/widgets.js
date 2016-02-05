var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('widgets', function() {

    it("should expose layer list", function(done) {

        var listWidgetMapConfig =  {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from test_table',
                        cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            names: {
                                type: 'list',
                                options: {
                                    columns: ['name']
                                }
                            }
                        }
                    }
                }
            ]
        };

        var testClient = new TestClient(listWidgetMapConfig);

        testClient.getWidget('names', function(err, res) {
            if (err) {
                return done(err);
            }

            var expectedList = [
                {name:"Hawai"},
                {name:"El Estocolmo"},
                {name:"El Rey del Tallarín"},
                {name:"El Lacón"},
                {name:"El Pico"}
            ];
            assert.deepEqual(JSON.parse(res.body).rows, expectedList);

            testClient.drain(done);
        });
    });

    it("should expose layer histogram", function(done) {
        var histogramMapConfig =  {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            pop_max: {
                                type: 'histogram',
                                options: {
                                    column: 'pop_max'
                                }
                            }
                        }
                    }
                }
            ]
        };

        var testClient = new TestClient(histogramMapConfig);

        testClient.getWidget('pop_max', function(err, res) {
            if (err) {
                return done(err);
            }

            var histogram = JSON.parse(res.body);
            assert.ok(histogram.bins.length);

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('category', function() {
            var aggregationMapConfig =  {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                            cartocss_version: '2.3.0',
                            widgets: {
                                country_places_count: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0_a3',
                                        aggregation: 'count'
                                    }
                                }
                            }
                        }
                    }
                ]
            };

            it("should expose an aggregation", function(done) {
                var testClient = new TestClient(aggregationMapConfig);
                testClient.getWidget('country_places_count', { own_filter: 0 }, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);
                    assert.equal(aggregation.categories.length, 6);
                    assert.deepEqual(aggregation.categories[0], { value: 769, category: 'USA', agg: false });

                    testClient.drain(done);
                });
            });

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {country_places_count: {accept: ['CAN']}}
                        ]
                    }
                };
                var testClient = new TestClient(aggregationMapConfig);
                testClient.getWidget('country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);
                    assert.equal(aggregation.categories.length, 1);
                    assert.deepEqual(aggregation.categories[0], { value: 256, category: 'CAN', agg: false });

                    testClient.drain(done);
                });
            });
        });

        describe('range', function() {
            var histogramMapConfig =  {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                            cartocss_version: '2.3.0',
                            widgets: {
                                country_places_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'pop_max'
                                    }
                                }
                            }
                        }
                    }
                ]
            };

            it("should expose an histogram", function(done) {
                var testClient = new TestClient(histogramMapConfig);
                testClient.getWidget('country_places_histogram', { own_filter: 0 }, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(
                        histogram.bins[0],
                        { bin: 0, freq: 6497, min: 0, max: 742572, avg: 113511.16823149147 }
                    );

                    testClient.drain(done);
                });
            });

            it("should expose a filtered histogram", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_histogram: { min: 4000000 }
                            }
                        ]
                    }
                };
                var testClient = new TestClient(histogramMapConfig);
                testClient.getWidget('country_places_histogram', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(histogram.bins[0], {
                        bin: 0,
                        freq: 62,
                        min: 4000000,
                        max: 9276403,
                        avg: 5815009.596774193
                    });

                    testClient.drain(done);
                });
            });
        });

        describe('combine widget filters', function() {
            var combinedWidgetsMapConfig =  {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                            cartocss_version: '2.3.0',
                            widgets: {
                                country_places_count: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0_a3',
                                        aggregation: 'count'
                                    }
                                },
                                country_places_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'pop_max'
                                    }
                                }
                            }
                        }
                    }
                ]
            };

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_count: { reject: ['CHN'] }
                            }
                        ]
                    }
                };
                var testClient = new TestClient(combinedWidgetsMapConfig);
                testClient.getWidget('country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], { value: 769, category: "USA", agg: false });

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.category === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    testClient.drain(done);
                });
            });

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_count: { reject: ['CHN'] },
                                country_places_histogram: { min: 7000000 }
                            }
                        ]
                    }
                };
                var testClient = new TestClient(combinedWidgetsMapConfig);
                testClient.getWidget('country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], { value: 4, category: 'IND', agg: false });

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.category === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    testClient.drain(done);
                });
            });

            it("should allow to filter by bounding box a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_histogram: { min: 50000 }
                            }
                        ]
                    },
                    bbox: '-20,0,45,60'
                };
                var testClient = new TestClient(combinedWidgetsMapConfig);
                testClient.getWidget('country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], { value: 96, category: "RUS", agg: false });

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.category === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    testClient.drain(done);
                });
            });

            it("should allow to filter by bounding box a filtered aggregation, with reject", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_count: { reject: ['RUS'] },
                                country_places_histogram: { min: 50000 }
                            }
                        ]
                    },
                    bbox: '-20,0,45,60'
                };
                var testClient = new TestClient(combinedWidgetsMapConfig);
                testClient.getWidget('country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], { value: 77, category: "TUR", agg: false });

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.category === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    testClient.drain(done);
                });
            });
        });
    });

});
