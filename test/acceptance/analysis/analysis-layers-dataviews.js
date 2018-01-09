require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
var dot = require('dot');

describe('analysis-layers-dataviews', function() {

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

    function createMapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var DEFAULT_MULTITYPE_STYLE = cartocss();

    var mapConfig = createMapConfig(
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

    it('should get histogram dataview', function(done) {
        var testClient = new TestClient(mapConfig, 1234);

        testClient.getDataview('pop_max_histogram', function(err, dataview) {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_start, 0);

            testClient.drain(done);
        });
    });

    it('should get a filtered histogram dataview', function(done) {
        var testClient = new TestClient(mapConfig, 1234);

        var params = {
            filters: {
                dataviews: {
                    pop_max_histogram: {
                        min: 2e6
                    }
                }
            },
            own_filter: 1
        };

        testClient.getDataview('pop_max_histogram', params, function(err, dataview) {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_start, 2008000);

            testClient.drain(done);
        });
    });

    it('should skip the filter when sending own_filter=0 for histogram dataview', function(done) {
        var testClient = new TestClient(mapConfig, 1234);

        var params = {
            filters: {
                dataviews: {
                    pop_max_histogram: {
                        min: 2e6
                    }
                }
            },
            own_filter: 0
        };

        testClient.getDataview('pop_max_histogram', params, function(err, dataview) {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_start, 0);

            testClient.drain(done);
        });
    });
});
