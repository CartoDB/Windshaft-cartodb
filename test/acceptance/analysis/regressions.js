require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('analysis-layers regressions', function() {
    it('should return a complete list of nodes from analysis', function(done) {
        var mapConfig = {
            "version": "1.5.0",
            "layers": [
                {
                    "type": "cartodb",
                    "options": {
                        "cartocss": TestClient.CARTOCSS.POINTS,
                        "cartocss_version": "2.1.1",
                        "interactivity": [],
                        "source": {
                            "id": "a4"
                        }
                    }
                },
                {
                    "type": "cartodb",
                    "options": {
                        "cartocss": TestClient.CARTOCSS.POINTS,
                        "cartocss_version": "2.1.0",
                        "interactivity": [],
                        "source": {
                            "id": "b1"
                        }
                    }
                }
            ],
            "dataviews": {
                "74493a30-4679-4b72-a60c-b6f808b57c98": {
                    "type": "histogram",
                    "source": {
                        "id": "b0"
                    },
                    "options": {
                        "column": "customer_value",
                        "bins": 10
                    }
                }
            },
            "analyses": [
                {
                    "id": "a4",
                    "type": "intersection",
                    "params": {
                        "source": {
                            "id": "a3",
                            "type": "buffer",
                            "params": {
                                "source": {
                                    "id": "a2",
                                    "type": "centroid",
                                    "params": {
                                        "source": {
                                            "id": "b1",
                                            "type": "kmeans",
                                            "params": {
                                                "source": {
                                                    "id": "b0",
                                                    "type": "source",
                                                    "params": {
                                                        "query": "SELECT * FROM populated_places_simple_reduced"
                                                    }
                                                },
                                                "clusters": 5
                                            }
                                        },
                                        "category_column": "cluster_no"
                                    }
                                },
                                "radius": 200000
                            }
                        },
                        "target": {
                            "id": "customer_home_locations",
                            "type": "source",
                            "params": {
                                "query": "SELECT * FROM populated_places_simple_reduced"
                            }
                        }
                    }
                }
            ]
        };

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.ok(layergroupResult);
            assert.ok(layergroupResult.metadata);
            var analyses = layergroupResult.metadata.analyses;
            assert.ok(analyses);
            assert.equal(analyses.length, 1);

            var expectedIds = ['customer_home_locations', 'b0', 'b1', 'a2', 'a3', 'a4'];
            assert.equal(Object.keys(analyses[0].nodes).length, expectedIds.length);
            expectedIds.forEach(function(expectedId) {
                analyses[0].nodes.hasOwnProperty(expectedId);
            });

            testClient.drain(done);
        });
    });

});
