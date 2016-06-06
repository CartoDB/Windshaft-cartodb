require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('widgets-regressions', function() {

    describe('aggregations', function() {

        afterEach(function(done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        it('should work when there is a mix of layers with and without widgets', function(done) {
            var layersWithNoWidgetsMapConfig = {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            widgets: {
                                adm0name: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0name',
                                        aggregation: 'sum',
                                        aggregationColumn: 'pop_max'
                                    }
                                }
                            }
                        }
                    },
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced limit 100',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1'
                        }
                    }
                ]
            };

            this.testClient = new TestClient(layersWithNoWidgetsMapConfig);
            this.testClient.getWidget('adm0name', { own_filter: 0 }, function (err, res, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');

                assert.equal(aggregation.categories.length, 6);

                assert.deepEqual(
                    aggregation.categories[0],
                    { category: 'China', value: 374537585, agg: false }
                );

                assert.deepEqual(
                    aggregation.categories[aggregation.categories.length - 1],
                    { category: 'Other', value: 1412626289, agg: true }
                );

                done();
            });
        });

        it('should work when there is a mix of layers with and without widgets, source and sql', function(done) {
            var mixOfLayersMapConfig = {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            widgets: {
                                adm0name_categories: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0name',
                                        aggregation: 'sum',
                                        aggregationColumn: 'pop_max'
                                    }
                                },
                                adm1name_categories: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm1name',
                                        aggregation: 'sum',
                                        aggregationColumn: 'pop_max'
                                    }
                                }
                            }
                        }
                    },
                    {
                        type: 'mapnik',
                        options: {
                            source: {id: 'head-limited'},
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            widgets: {
                                pop_max_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'pop_max'
                                    }
                                }
                            }
                        }
                    },
                    {
                        "type": "http",
                        "options": {
                            "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                            "subdomains": "abcd"
                        }
                    }
                ],
                analyses: [
                    {
                        id: 'head-limited',
                        type: 'source',
                        params: {
                            query: 'select * from populated_places_simple_reduced limit 100'
                        }
                    }
                ],
                dataviews: {
                    wadus: {
                        type: 'histogram',
                        source: {
                            id: 'head-limited'
                        },
                        options: {
                            column: 'population'
                        }
                    }
                }
            };

            this.testClient = new TestClient(mixOfLayersMapConfig);
            this.testClient.getLayergroup(function(err, layergroup) {
                assert.ok(!err, err);
                assert.ok(layergroup.metadata);
                var metadata = layergroup.metadata;
                assert.equal(metadata.layers.length, 3);
                assert.equal(metadata.analyses.length, 2);
                assert.equal(Object.keys(metadata.dataviews).length, 4);
                assert.deepEqual(
                    Object.keys(metadata.dataviews),
                    ['wadus', 'adm0name_categories', 'adm1name_categories', 'pop_max_histogram']
                );


                done();
            });
        });

        it('should work with layers not containing sql', function(done) {
            var nonSqlLayersMapConfig = {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            widgets: {
                                adm0name: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0name',
                                        aggregation: 'sum',
                                        aggregationColumn: 'pop_max'
                                    }
                                }
                            }
                        }
                    },
                    {
                        "type": "http",
                        "options": {
                            "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                            "subdomains": "abcd"
                        }
                    }
                ]
            };

            this.testClient = new TestClient(nonSqlLayersMapConfig);
            this.testClient.getWidget('adm0name', { own_filter: 0 }, function (err, res, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');

                assert.equal(aggregation.categories.length, 6);

                assert.deepEqual(
                    aggregation.categories[0],
                    { category: 'China', value: 374537585, agg: false }
                );

                assert.deepEqual(
                    aggregation.categories[aggregation.categories.length - 1],
                    { category: 'Other', value: 1412626289, agg: true }
                );

                done();
            });
        });

    });

});
