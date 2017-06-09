require('../../support/test_helper');
var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function createMapConfig(layers, dataviews, analysis) {
    return {
        version: '1.5.0',
        layers: layers,
        dataviews: dataviews || {},
        analyses: analysis || []
    };
}

describe('formula-dataview: special float valuer', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    var mapConfig = createMapConfig(
        [
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
        {
            val_formula: {
                source: {
                    id: 'a0'
                },
                type: 'formula',
                options: {
                    column: 'val',
                    operation: 'avg'
                }
            }
        },
        [
            {
                "id": "a0",
                "type": "source",
                "params": {
                    "query": [
                        'SELECT',
                        '  null::geometry the_geom_webmercator,',
                        '  CASE',
                        '    WHEN x % 4 = 0 THEN \'infinity\'::float',
                        '    WHEN x % 4 = 1 THEN \'-infinity\'::float',
                        '    WHEN x % 4 = 2 THEN \'NaN\'::float',
                        '    ELSE x',
                        '  END AS val',
                        'FROM generate_series(1, 1000) x'
                    ].join('\n')
                }
            }
        ]
    );

    it('should filter infinities out and count them in the summary', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('val_formula', {}, function(err, dataview) {
            assert.ok(!err, err);
            assert.equal(dataview.result, 501);
            assert.ok(dataview.infinities === (250 + 250));
            assert.ok(dataview.nans === 250);
            done();
        });
    });
});
