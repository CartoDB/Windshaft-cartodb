require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('analysis-layers-dataviews-geojson', function() {

    function createMapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var CARTOCSS = [
        "#points {",
        "  marker-fill-opacity: 1.0;",
        "  marker-line-color: #FFF;",
        "  marker-line-width: 0.5;",
        "  marker-line-opacity: 1.0;",
        "  marker-placement: point;",
        "  marker-type: ellipse;",
        "  marker-width: 8;",
        "  marker-fill: red;",
        "  marker-allow-overlap: true;",
        "}"
    ].join('\n');

    var mapConfig = createMapConfig(
        [
            {
                "type": "cartodb",
                "options": {
                    "source": {
                        "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                    },
                    "cartocss": CARTOCSS,
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
    );

    it('should get pop_max column from dataview', function(done) {
        var testClient = new TestClient(mapConfig, 1234);

        testClient.getTile(0, 0, 0, {format: 'geojson', layers: 0}, function(err, res, geojson) {
            assert.ok(!err, err);

            assert.ok(Array.isArray(geojson.features));
            assert.ok(geojson.features.length > 0);
            var feature = geojson.features[0];
            assert.ok(feature.properties.hasOwnProperty('pop_max'), 'Missing pop_max property');

            testClient.drain(done);
        });
    });

});
