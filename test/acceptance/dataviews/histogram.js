require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
var moment = require('moment');

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

describe('histogram-dataview for date column type', function() {
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
                        "id": "date-histogram-source"
                    },
                    "cartocss": "#points { marker-width: 10; marker-fill: red; }",
                    "cartocss_version": "2.3.0"
                }
            }
        ],
        {
            date_histogram: {
                source: {
                    id: 'date-histogram-source'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'month',
                    timezone: -7200
                }
            }
        },
        [
            {
                "id": "date-histogram-source",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2008-04-09 01:00:00'::timestamp, '1 day'::interval",
                        ") date"
                    ].join(' ')
                }
            }
        ]
    );

    it('should create a date histogram aggregated in months', function (done) {
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('date_histogram', {}, function(err, dataview) {
            assert.ok(!err, err);
            assert.equal(dataview.type, 'histogram');
            assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
            assert.equal(dataview.bins.length, 15);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });

    it('should override aggregation in weeks', function (done) {
        var params = {
            aggregation: 'week'
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('date_histogram', params, function(err, dataview) {
            assert.ok(!err, err);
            assert.equal(dataview.type, 'histogram');
            assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
            assert.equal(dataview.bins.length, 61);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });

    it('should override start and end', function (done) {
        var params = {
            start: 1180659600, // 2007-06-01 01:00:00
            end: 1193792400 // 2007-10-31 01:00:00
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('date_histogram', params, function(err, dataview) {
            assert.ok(!err, err);
            assert.equal(dataview.type, 'histogram');
            assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
            assert.equal(dataview.bins.length, 6);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });

    it('should aggregate respecting timezone', function (done) {
        var TIMEZONE_CEST_IN_SECONDS = 2 * 3600; // Central European Summer Time (Daylight Saving Time)
        var TIMEZONE_CEST_IN_MINUTES = 2 * 60; // Central European Summer Time (Daylight Saving Time)
        var params = {
            timezone: TIMEZONE_CEST_IN_SECONDS
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('date_histogram', params, function(err, dataview) {
            assert.ok(!err, err);
            assert.equal(dataview.type, 'histogram');
            assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
            assert.equal(dataview.bins.length, 15);

            var initialTimestamp = '2007-02-01T00:00:00+02:00';
            var binsStartInMilliseconds = dataview.bins_start * 1000;
            var binsStartFormatted = moment.utc(binsStartInMilliseconds).utcOffset(TIMEZONE_CEST_IN_MINUTES).format();
            assert.equal(binsStartFormatted, initialTimestamp);

            dataview.bins.forEach(function(bin, index) {
                var binTimestampExpected = moment.utc(initialTimestamp).utcOffset(TIMEZONE_CEST_IN_MINUTES).add(index, 'month').format();
                console.log(binTimestampExpected);
                var binsTimestampInMilliseconds = bin.timestamp * 1000;
                var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds).utcOffset(TIMEZONE_CEST_IN_MINUTES).format();
                assert.equal(binTimestampFormatted, binTimestampExpected);

                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });
});
