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

describe('histogram-dataview', function() {

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
                        "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                    },
                    "cartocss": "#points { marker-width: 10; marker-fill: red; }",
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
                    column: 'x'
                }
            }
        },
        [
            {
                "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                "type": "source",
                "params": {
                    "query": "select null::geometry the_geom_webmercator, x from generate_series(0,1000) x"
                }
            }
        ]
    );

    it('should get bin_width right when max > min in filter', function(done) {
        var params = {
            bins: 10,
            start: 1e3,
            end: 0
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('pop_max_histogram', params, function(err, dataview) {
            assert.ok(!err, err);

            assert.equal(dataview.type, 'histogram');
            assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });

    it('should cast all overridable params to numbers', function(done) {
        var params = {
            bins: '256 AS other, (select 256 * 2) AS bins_number--',
            start: 1e3,
            end: 0,
            response: TestClient.RESPONSE.ERROR
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('pop_max_histogram', params, function(err, res) {
            assert.ok(!err, err);
            assert.ok(res.errors);
            assert.equal(res.errors.length, 1);
            assert.ok(res.errors[0].match(/Invalid number format for parameter 'bins'/));

            done();
        });
    });
});


describe('histogram-dataview: special float valuer', function() {

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
            val_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'val'
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
        this.testClient.getDataview('val_histogram', {}, function(err, dataview) {
            assert.ok(!err, err);
            assert.ok(dataview.infinities === (250 + 250));
            assert.ok(dataview.nans === 250);
            done();
        });
    });
});
