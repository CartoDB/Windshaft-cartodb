require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
var dot = require('dot');

describe('analysis-layers', function() {

    var IMAGE_TOLERANCE_PER_MIL = 20;

    var multitypeStyleTemplate = dot.template([
        "#points['mapnik::geometry_type'=1] {",
        "  marker-fill-opacity: {{=it._opacity}};",
        "  marker-line-color: #FFF;",
        "  marker-line-width: 0.5;",
        "  marker-line-opacity: {{=it._opacity}};",
        "  marker-placement: point;",
        "  marker-type: ellipse;",
        "  marker-width: 8;",
        "  marker-fill: {{=it._color}};",
        "  marker-allow-overlap: true;",
        "}",
        "#lines['mapnik::geometry_type'=2] {",
        "  line-color: {{=it._color}};",
        "  line-width: 2;",
        "  line-opacity: {{=it._opacity}};",
        "}",
        "#polygons['mapnik::geometry_type'=3] {",
        "  polygon-fill: {{=it._color}};",
        "  polygon-opacity: {{=it._opacity}};",
        "  line-color: #FFF;",
        "  line-width: 0.5;",
        "  line-opacity: {{=it._opacity}};",
        "}"
    ].join('\n'));


    function cartocss(color, opacity) {
        return multitypeStyleTemplate({
            _color: color || '#F11810',
            _opacity: Number.isFinite(opacity) ? opacity : 1
        });
    }

    function mapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var DEFAULT_MULTITYPE_STYLE = cartocss();

    var TILE_ANALYSIS_TABLES = { z: 0, x: 0, y: 0 };

    var useCases = [
        {
            desc: 'basic source-id mapnik layer',
            fixture: 'basic-source-id-mapnik-layer.png',
            mapConfig: mapConfig(
                [
                    {
                        "type": "cartodb",
                        "options": {
                            "source": {
                                "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                            },
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
                            "cartocss_version": "2.3.0"
                        }
                    }
                ],
                {},
                [
                    {
                        "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                        "type": "source",
                        "params": {
                            "query": "select * from populated_places_simple_reduced"
                        }
                    }
                ]
            )
        },

        {
            desc: 'buffer over source',
            fixture: 'buffer-over-source.png',
            tile: { z: 7, x: 61, y: 47 },
            mapConfig: mapConfig(
                [
                    {
                        "type": "cartodb",
                        "options": {
                            "source": {
                                "id": "HEAD"
                            },
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
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
            )
        }
    ];

    useCases.forEach(function(useCase) {
        it('should implement use case: "' + useCase.desc + '"', function(done) {

            var testClient = new TestClient(useCase.mapConfig, 1234);

            var tile = useCase.tile || TILE_ANALYSIS_TABLES;

            testClient.getTile(tile.z, tile.x, tile.y, function(err, res, image) {
                assert.ok(!err, err);

                // To generate images use:
                // image.save('/tmp/' + useCase.desc.replace(/\s/g, '-') + '.png');

                var fixturePath = './test/fixtures/analysis/' + useCase.fixture;
                assert.imageIsSimilarToFile(image, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                    assert.ok(!err, err);

                    testClient.drain(done);
                });
            });
        });
    });

    it('should NOT fail for non-authenticated requests when it is just source', function(done) {
        var useCase = useCases[0];

        // No API key here
        var testClient = new TestClient(useCase.mapConfig);

        testClient.getLayergroup(function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.metadata.layers.length, 1);

            testClient.drain(done);
        });
    });

    it('should fail for non-authenticated requests that has a node other than "source"', function(done) {
        var useCase = useCases[1];

        // No API key here
        var testClient = new TestClient(useCase.mapConfig);

        var PERMISSION_DENIED_RESPONSE = {
            status: 403,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        testClient.getLayergroup(PERMISSION_DENIED_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);
            assert.deepEqual(
                layergroupResult.errors,
                ["Analysis requires authentication with API key: permission denied."]
            );

            testClient.drain(done);
        });
    });

    it('should retrieve enough metadata about analyses', function(done) {
        var useCase = useCases[1];

        // No API key here
        var testClient = new TestClient(useCase.mapConfig, 1234);

        testClient.getLayergroup(function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.ok(
                Array.isArray(layergroupResult.metadata.analyses),
                    'Missing "analyses" array metadata from: ' + JSON.stringify(layergroupResult)
            );
            var analyses = layergroupResult.metadata.analyses;
            assert.equal(analyses.length, 1, 'Invalid number of analyses in metadata');
            var nodes = analyses[0].nodes;
            var nodesIds = Object.keys(nodes);
            assert.deepEqual(nodesIds, ['2570e105-7b37-40d2-bdf4-1af889598745', 'HEAD']);
            nodesIds.forEach(function(nodeId) {
                var node = nodes[nodeId];
                assert.ok(node.hasOwnProperty('url'), 'Missing "url" attribute in node');
                assert.ok(node.hasOwnProperty('status'), 'Missing "status" attribute in node');
                assert.ok(node.hasOwnProperty('query'), 'Missing "status" attribute in node');
            });

            testClient.drain(done);
        });
    });

    it('should have analysis metadata when dataviews point to source node', function(done) {
        var useCase = {
            desc: 'basic source-id mapnik layer',
            fixture: 'basic-source-id-mapnik-layer.png',
            mapConfig: mapConfig(
                [
                    {
                        "type": "cartodb",
                        "options": {
                            "sql": "select * from populated_places_simple_reduced",
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
                            "cartocss_version": "2.3.0"
                        }
                    },
                    {
                        "type": "cartodb",
                        "options": {
                            "source": {
                                "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                            },
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
                            "cartocss_version": "2.3.0"
                        }
                    },
                    {
                        "type": "cartodb",
                        "options": {
                            "sql": "select * from populated_places_simple_reduced",
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
                            "cartocss_version": "2.3.0"
                        }
                    }
                ],
                {
                    pop_max_histogram: {
                        source: {
                            id: '2570e105-7b37-40d2-bdf4-1af889598745'
                        },
                        type: 'histogram',
                        options: {
                            column: 'pop_max'
                        }
                    },
                    scalerank_histogram: {
                        source: {
                            id: '2570e105-7b37-40d2-bdf4-1af889598745'
                        },
                        type: 'histogram',
                        options: {
                            column: 'scalerank'
                        }
                    }
                },
                [
                    {
                        "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                        "type": "source",
                        "params": {
                            "query": "select * from populated_places_simple_reduced"
                        }
                    }
                ]
            )
        };

        var testClient = new TestClient(useCase.mapConfig, 1234);

        testClient.getLayergroup(function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.ok(
                Array.isArray(layergroupResult.metadata.analyses),
                    'Missing "analyses" array metadata from: ' + JSON.stringify(layergroupResult)
            );
            var analyses = layergroupResult.metadata.analyses;
            assert.equal(analyses.length, 1, 'Invalid number of analyses in metadata');
            var nodes = analyses[0].nodes;

            var nodesIds = Object.keys(nodes);
            assert.deepEqual(nodesIds, ['2570e105-7b37-40d2-bdf4-1af889598745']);
            nodesIds.forEach(function(nodeId) {
                var node = nodes[nodeId];
                assert.ok(node.hasOwnProperty('url'), 'Missing "url" attribute in node');
                assert.ok(node.hasOwnProperty('status'), 'Missing "status" attribute in node');
                assert.ok(node.hasOwnProperty('query'), 'Missing "status" attribute in node');
            });

            testClient.drain(done);
        });
    });
});
