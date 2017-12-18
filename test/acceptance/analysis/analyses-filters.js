require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

describe('analysis-layers-dataviews', () => {

    const CARTOCSS = `#layer {
        marker-fill-opacity: 1;
        marker-line-color: white;
        marker-line-width: 0.5;
        marker-line-opacity: 1;
        marker-placement: point;
        marker-type: ellipse;
        marker-width: 8;
        marker-fill: red;
        marker-allow-overlap: true;
      }`;

    const mapConfig = {
        version: '1.6.0',
        layers: [
            {
                "type": "cartodb",
                "options": {
                    "source": {
                        "id": "a1"
                    },
                    "cartocss": CARTOCSS,
                    "cartocss_version": "2.3.0"
                }
            }
        ],
        dataviews: {
            pop_max_histogram: {
                source: {
                    id: 'a1'
                },
                type: 'histogram',
                options: {
                    column: 'pop_max'
                }
            }
        },
        analyses: [
            {
                "id": "a1",
                "type": "source",
                "params": {
                    "query": "select * from populated_places_simple_reduced"
                }
            }
        ]
    };

    it('should get a filtered histogram dataview', function(done) {
        const testClient = new TestClient(mapConfig, 1234);

        const params = {
            filters: {
                analyses: {
                    'a1': [
                        {
                            type: 'range',
                            column: 'pop_max',
                            params: {
                                min: 2e6
                            }
                        }
                    ]
                }
            }
        };

        testClient.getDataview('pop_max_histogram', params, (err, dataview) => {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_start, 2008000);

            testClient.drain(done);
        });
    });
});
