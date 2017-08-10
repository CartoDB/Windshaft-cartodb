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


        it('should not count the polygons outside the bounding box', function(done) {
            var notIntersectingLeftTriangle = {
                type: "Polygon",
                coordinates:[[
                    [-161.015625,69.28725695167886],
                    [-162.7734375,-7.710991655433217],
                    [-40.78125,-8.059229627200192],
                    [-161.015625,69.28725695167886]
                ]]
            };

            var notIntersectingRightTriangle = {
                type: "Polygon",
                coordinates: [[
                    [-29.179687499999996,-7.01366792756663],
                    [103.71093749999999,-6.664607562172573],
                    [105.46875,69.16255790810501],
                    [-29.179687499999996,-7.01366792756663]
                ]]
            };

            var intersectingTriangle = {
                type: "Polygon",
                coordinates:[[
                    [-117.42187500000001,68.13885164925573],
                    [-35.859375,20.96143961409684],
                    [59.4140625,68.52823492039876],
                    [-117.42187500000001,68.13885164925573]
                ]]
            };

            let query = `  
                SELECT
                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON(
                        '${JSON.stringify(notIntersectingLeftTriangle)}'
                    ), 4326), 3857) AS the_geom_webmercator, 1 AS cartodb_id, 'notIntersectingLeftTriangle' AS name
                UNION
                SELECT
                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON(
                        '${JSON.stringify(notIntersectingRightTriangle)}'
                    ), 4326), 3857), 2, 'notIntersectingRightTriangle'
                UNION
                SELECT
                    ST_TRANSFORM(ST_SETSRID(ST_GeomFromGeoJSON(
                        '${JSON.stringify(intersectingTriangle)}'
                    ), 4326), 3857), 3, 'intersectingTriangle'
                `

            var mapConfig = {
                version: '1.5.0',
                layers: [
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
                dataviews: {
                    val_formula: {
                        source: {
                            id: 'a0'
                        },
                        type: 'aggregation',
                        options: {
                            column: "name",
                            aggregation: "count",
                        }
                    }
                },
                analyses: [
                    {
                        "id": "a0",
                        "type": "source",
                        "params": {
                            "query": query
                        }
                    }
                ]
            };

            this.testClient = new TestClient(mapConfig, 1234);
            var params = {
                bbox: '-77.34374999999999,45.82879925192134,17.578125,55.97379820507658'
            };
            this.testClient.getDataview('val_formula', params, function(err, dataview) {
                assert.equal(dataview.categories.length, 1);
                assert.equal(dataview.categories[0].category, 'intersectingTriangle')
                done();
            });
        });

    });

});
