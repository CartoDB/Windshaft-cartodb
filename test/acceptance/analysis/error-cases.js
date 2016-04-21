require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('analysis-layers error cases', function() {
    function mapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var useCases = [
        {
            desc: 'invalid source.id in layer',
            fixture: 'buffer-over-source.png',
            tile: { z: 7, x: 61, y: 47 },
            mapConfig: mapConfig(
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
            )
        }
    ];

    var ERROR_RESPONSE = {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    useCases.forEach(function(useCase) {
        it('should implement use case: "' + useCase.desc + '"', function(done) {

            var testClient = new TestClient(useCase.mapConfig, 1234);

            testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
                assert.ok(!err, err);

                assert.equal(layergroupResult.errors.length, 1);
                assert.equal(layergroupResult.errors[0], 'Missing analysis node.id="INVALID-SOURCE-ID" for layer=0');

                testClient.drain(done);
            });
        });
    });
});
