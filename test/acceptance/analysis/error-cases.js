require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('analysis-layers error cases', function() {
    function createMapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var ERROR_RESPONSE = {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    var AUTH_ERROR_RESPONSE = {
        status: 403,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    it('should handle missing analysis nodes for layers', function(done) {
        var mapConfig = createMapConfig(
            [
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "INVALID-SOURCE-ID"
                        },
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            {},
            [
                {
                    "id": "HEAD",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                            "type": "source",
                            "params": {
                                "query": "select * from populated_places_simple_reduced"
                            }
                        },
                        "radius": 50000
                    }
                }
            ]
        );

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(layergroupResult.errors[0], 'Missing analysis node.id="INVALID-SOURCE-ID" for layer=0');

            testClient.drain(done);
        });
    });

    it('should handle missing analyses when layers point to nonexistent one', function(done) {
        var mapConfig = createMapConfig(
            [
                {
                    "type": "http",
                    "options": {
                        "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
                        "subdomains": "abcd"
                    }
                },
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "ID-FOR-NONEXISTENT-ANALYSIS"
                        },
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ]
        );

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'Missing analysis node.id="ID-FOR-NONEXISTENT-ANALYSIS" for layer=1'
            );

            testClient.drain(done);
        });
    });

    it('should handle missing analyses when dataviews point to nonexistent one', function(done) {
        var mapConfig = createMapConfig(
            [
                {
                    "type": "http",
                    "options": {
                        "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
                        "subdomains": "abcd"
                    }
                },
                {
                    "type": "cartodb",
                    "options": {
                        "sql": "select * from populated_places_simple_reduced",
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            {
                pop_max_histogram: {
                    source: {
                        id: 'ID-FOR-NONEXISTENT-ANALYSIS'
                    },
                    type: 'histogram',
                    options: {
                        column: 'pop_max'
                    }
                }
            }
        );

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(layergroupResult.errors[0], 'Node with `source.id="ID-FOR-NONEXISTENT-ANALYSIS"`' +
                ' not found in analyses for dataview "pop_max_histogram"');

            testClient.drain(done);
        });
    });

    it('camshaft: should return error missing analysis nodes for layers with some context', function(done) {
        var mapConfig = createMapConfig(
            [
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "HEAD"
                        },
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            {},
            [
                {
                    "id": "HEAD",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "HEAD",
                            "type": "source",
                            "params": {
                                "query": "select * from populated_places_simple_reduced"
                            }
                        },
                        "radius": 50000
                    }
                }
            ]
        );

        var testClient = new TestClient(mapConfig, 11111);

        testClient.getLayergroup(AUTH_ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'Analysis requires authentication with API key: permission denied.'
            );

            assert.equal(layergroupResult.errors_with_context[0].type, 'analysis');
            assert.equal(
                layergroupResult.errors_with_context[0].message,
                'Analysis requires authentication with API key: permission denied.'
            );
            assert.equal(layergroupResult.errors_with_context[0].analysis.id, 'HEAD');
            assert.equal(layergroupResult.errors_with_context[0].analysis.type, 'buffer');

            testClient.drain(done);
        });
    });


    it('camshaft: should return error: Missing required param "radius"; with context', function(done) {
        var mapConfig = createMapConfig(
            [
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "HEAD"
                        },
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            {},
            [
                {
                    "id": "HEAD",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "HEAD2",
                            "type": "source",
                            "params": {
                                "query": "select * from populated_places_simple_reduced"
                            }
                        }
                    }
                }
            ]
        );

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'Missing required param "radius"'
            );

            assert.equal(layergroupResult.errors_with_context[0].type, 'analysis');
            assert.equal(layergroupResult.errors_with_context[0].message, 'Missing required param "radius"');
            assert.equal(layergroupResult.errors_with_context[0].analysis.id, 'HEAD');
            assert.equal(layergroupResult.errors_with_context[0].analysis.type, 'buffer');

            testClient.drain(done);
        });
    });

    it('should return missing param error of outer node indicating the node_id and context', function(done) {
        var mapConfig = createMapConfig([{
            "type": "cartodb",
            "options": {
                "source": {
                    "id": "HEAD"
                },
                "cartocss": '#polygons { polygon-fill: red; }',
                "cartocss_version": "2.3.0"
            }
        }], {}, [{
            "id": "HEAD",
            "type": "buffer",
            "params": {
                "source": {
                    "id": "HEAD2",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "HEAD3",
                            "type": "source",
                            "params": {
                                "query": "select * from populated_places_simple_reduced"
                            }
                        },
                        "radius": 10
                    }
                }
            }
            // radius: 'missing'
        }]);

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'Missing required param "radius"'
            );

            assert.equal(layergroupResult.errors_with_context[0].type, 'analysis');
            assert.equal(layergroupResult.errors_with_context[0].message, 'Missing required param "radius"');
            assert.equal(layergroupResult.errors_with_context[0].analysis.id, 'HEAD');
            assert.equal(layergroupResult.errors_with_context[0].analysis.type, 'buffer');
            assert.equal(layergroupResult.errors_with_context[0].analysis.node_id, 'HEAD');

            testClient.drain(done);
        });
    });

    it('should return invalid param type error of inner node indicating the node_id and context', function(done) {
        var mapConfig = createMapConfig([{
            "type": "cartodb",
            "options": {
                "source": {
                    "id": "HEAD"
                },
                "cartocss": '#polygons { polygon-fill: red; }',
                "cartocss_version": "2.3.0"
            }
        }], {}, [{
            "id": "HEAD",
            "type": "buffer",
            "params": {
                "source": {
                    "id": "HEAD2",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "HEAD3",
                            "type": "source",
                            "params": {
                                "query": "select * from populated_places_simple_reduced"
                            }
                        },
                        "radius": 'invalid_radius'
                    }
                },
                "radius": 10
            }
        }]);

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'Invalid type for param "radius", expects "number" type, got `"invalid_radius"`'
            );

            assert.equal(layergroupResult.errors_with_context[0].type, 'analysis');
            assert.equal(
                layergroupResult.errors_with_context[0].message,
                'Invalid type for param "radius", expects "number" type, got `"invalid_radius"`'
            );
            assert.equal(layergroupResult.errors_with_context[0].analysis.id, 'HEAD');
            assert.equal(layergroupResult.errors_with_context[0].analysis.type, 'buffer');
            assert.equal(layergroupResult.errors_with_context[0].analysis.node_id, 'HEAD2');

            testClient.drain(done);
        });
    });

    it('should return "function does not exist" indicating the node_id and context', function(done) {
        var mapConfig = createMapConfig([{
            "type": "cartodb",
            "options": {
                "source": {
                    "id": "HEAD"
                },
                "cartocss": '#polygons { polygon-fill: red; }',
                "cartocss_version": "2.3.0"
            }
        }], {}, [{
            "id": "HEAD",
            "type": "buffer",
            "params": {
                "source": {
                    "id": "HEAD2",
                    "type": "buffer",
                    "params": {
                        "source": {
                            "id": "HEAD3",
                            "type": 'deprecated-sql-function',
                            "params": {
                                "id": "HEAD4",
                                "function_name": 'DEP_EXT_does_not_exist_fn',
                                "primary_source": {
                                    "type": 'source',
                                    "params": {
                                        "query": "select * from populated_places_simple_reduced"
                                    }
                                },
                                "function_args": ['wadus']
                            }
                        },
                        "radius": 10
                    }
                },
                "radius": 10
            }
        }]);

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(
                layergroupResult.errors[0],
                'function dep_ext_does_not_exist_fn(unknown, unknown, unknown, text[], unknown) does not exist'
            );

            assert.equal(layergroupResult.errors_with_context[0].type, 'analysis');
            assert.equal(
                layergroupResult.errors_with_context[0].message,
                'function dep_ext_does_not_exist_fn(unknown, unknown, unknown, text[], unknown) does not exist'
            );
            assert.equal(layergroupResult.errors_with_context[0].analysis.id, 'HEAD');
            assert.equal(layergroupResult.errors_with_context[0].analysis.type, 'buffer');
            assert.equal(layergroupResult.errors_with_context[0].analysis.node_id, 'HEAD3');

            testClient.drain(done);
        });
    });



});
