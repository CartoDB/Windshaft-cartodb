require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('widgets', function() {

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
