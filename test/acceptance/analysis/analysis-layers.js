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

    var TILE_ANALYSIS_TABLES = { z: 14, x: 8023, y: 6177 };

    var useCases = [
        {
            desc: 'basic source-id mapnik layer',
            mapConfig: mapConfig(
                [
                    {
                        "type": "cartodb",
                        "options": {
                            "source": {
                                "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                            },
                            "cartocss": DEFAULT_MULTITYPE_STYLE,
                            "cartocss_version": "2.1.1",
                            "interactivity": []
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
            ),
            tile: { z: 0, x: 0, y: 0 }
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

                var fixturePath = './test/fixtures/analysis/basic-source-id-mapnik-layer.png';
                assert.imageIsSimilarToFile(image, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                    assert.ok(!err, err);

                    testClient.drain(done);
                });
            });
        });
    });
});
