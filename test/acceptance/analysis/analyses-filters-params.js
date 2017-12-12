require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

describe('analysis-filters-params', () => {

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
            },
            pop_min_histogram: {
                source: {
                    id: 'a1'
                },
                type: 'histogram',
                options: {
                    column: 'pop_min'
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

    var params = {
        filters: {
            dataviews: {
                pop_max_histogram: {
                    min: 2e6
                },
                pop_min_histogram: {
                    max: 2e6
                }
            }
        }
    };


    it('should get a filtered histogram dataview with all filters', function(done) {
        const testClient = new TestClient(mapConfig, 1234);

        params.own_filter = 1;

        testClient.getDataview('pop_max_histogram', params, (err, dataview) => {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_count, 6);

            testClient.drain(done);
        });
    });

    it('should get a filtered histogram dataview with all filters except my own filter', function(done) {
        const testClient = new TestClient(mapConfig, 1234);

        params.own_filter = 0;

        testClient.getDataview('pop_max_histogram', params, (err, dataview) => {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_count, 24);

            testClient.drain(done);
        });
    });

    it('should get a filtered histogram dataview without filters', function(done) {
        const testClient = new TestClient(mapConfig, 1234);

        params.no_filters = 1;

        testClient.getDataview('pop_max_histogram', params, (err, dataview) => {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.bins_count, 48);

            testClient.drain(done);
        });
    });

});
