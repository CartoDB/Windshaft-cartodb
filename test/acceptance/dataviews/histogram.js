'use strict';

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

    it('should get bins with min >= start and max <= end', function(done) {
        var params = {
            bins: 3,
            start: 50,
            end: 500
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('pop_max_histogram', params, function(err, dataview) {
            assert.ok(!err, err);

            assert.ok(3 === dataview.bins_count, 'Unexpected bin count: ' + dataview.bins_count);
            assert.ok(3 === dataview.bins.length, 'Unexpected number of bins: ' + dataview.bins.length);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min >= params.start, 'bin min < start: ' + JSON.stringify(bin));
                assert.ok(bin.max <= params.end, 'bin max > end: ' + JSON.stringify(bin));
            });
            done();
        });
    });

    it('should work with min >= start and max <= end, autodetect bins', function(done) {
        var params = {
            start: 50,
            end: 500
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('pop_max_histogram', params, function(err, dataview) {
            assert.ok(!err, err);

            assert.ok(6 === dataview.bins_count, 'Unexpected bin count: ' + dataview.bins_count);
            assert.ok(6 === dataview.bins.length, 'Unexpected number of bins: ' + dataview.bins.length);
            dataview.bins.forEach(function(bin) {
                assert.ok(bin.min >= params.start, 'bin min < start: ' + JSON.stringify(bin));
                assert.ok(bin.max <= params.end, 'bin max > end: ' + JSON.stringify(bin));
            });
            done();
        });
    });

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
                        "id": "datetime-histogram-source-week"
                    },
                    "cartocss": "#points { marker-width: 10; marker-fill: red; }",
                    "cartocss_version": "2.3.0"
                }
            }
        ],
        {
            datetime_histogram: {
                source: {
                    id: 'datetime-histogram-source-week'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'month',
                    offset: -14400 // EDT Eastern Daylight Time (GMT-4) in seconds
                }
            },
            datetime_histogram_tz: {
                source: {
                    id: 'datetime-histogram-source-tz'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'month',
                    offset: -14400 // EDT Eastern Daylight Time (GMT-4) in seconds
                }
            },
            datetime_histogram_automatic_second: {
                source: {
                    id: 'datetime-histogram-source-second'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_minute: {
                source: {
                    id: 'datetime-histogram-source-minute'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_hour: {
                source: {
                    id: 'datetime-histogram-source-hour'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_day: {
                source: {
                    id: 'datetime-histogram-source-day'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_week: {
                source: {
                    id: 'datetime-histogram-source-week'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_month: {
                source: {
                    id: 'datetime-histogram-source-month'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_quarter: {
                source: {
                    id: 'datetime-histogram-source-quarter'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_year: {
                source: {
                    id: 'datetime-histogram-source-year'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_decade: {
                source: {
                    id: 'datetime-histogram-source-decade'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_century: {
                source: {
                    id: 'datetime-histogram-source-century'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            datetime_histogram_automatic_millennium: {
                source: {
                    id: 'datetime-histogram-source-millennium'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            date_histogram: {
                source: {
                    id: 'date-histogram-source'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'year'
                }
            },
            date_histogram_automatic: {
                source: {
                    id: 'date-histogram-source'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            minute_histogram: {
                source: {
                    id: 'minute-histogram-source-tz'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'minute'
                }
            }
        },
        [
            {
                "id": "datetime-histogram-source-second",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2007-02-15 01:00:57'::timestamp,",
                             "'0.9 second'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-minute",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2007-02-15 02:00:57'::timestamp,",
                            "'75 second'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-hour",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2007-02-18 02:00:57'::timestamp,",
                            "'47 minutes'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-day",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2007-04-18 02:00:57'::timestamp,",
                            "'24 hours'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-week",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2008-04-09 01:00:00'::timestamp,",
                            "'1 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-month",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2010-04-09 01:00:00'::timestamp,",
                            "'30 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-quarter",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'2007-02-15 01:00:00'::timestamp, '2020-04-09 01:00:00'::timestamp,",
                            "'30 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-year",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'1990-02-15 01:00:00'::timestamp, '2018-04-09 01:00:00'::timestamp,",
                            "'30 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-decade",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'1850-02-15 01:00:00'::timestamp, '2018-04-09 01:00:00'::timestamp,",
                            "'30 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-century",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'0650-02-15 01:00:00'::timestamp, '1918-04-09 01:00:00'::timestamp,",
                            "'6 years'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-millennium",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series(",
                            "'0005-02-15 01:00:00'::timestamp, '12000-04-09 01:00:00'::timestamp,",
                            "'72 years'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "datetime-histogram-source-tz",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series('2007-02-15 01:00:00+00'::timestamptz,",
                        "'2008-04-09 01:00:00+00'::timestamptz, '1 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "date-histogram-source",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date::date AS d",
                        "from generate_series(",
                            "'2007-02-15'::date, '2008-04-09'::date, '1 day'::interval",
                        ") date"
                    ].join(' ')
                }
            },
            {
                "id": "minute-histogram-source-tz",
                "type": "source",
                "params": {
                    "query": [
                        "select null::geometry the_geom_webmercator, date AS d",
                        "from generate_series('2007-02-15 23:50:00+00'::timestamptz,",
                        "'2007-02-16 00:10:00+00'::timestamptz, '1 minute'::interval",
                        ") date"
                    ].join(' ')
                }
            }
        ]
    );

    var dateHistogramsUseCases = [{
        desc: 'supporting timestamp with offset',
        dataviewId: 'datetime_histogram_tz'
    }, {
        desc: 'supporting timestamp without offset',
        dataviewId: 'datetime_histogram'
    }];

    dateHistogramsUseCases.forEach(function (test) {

        it('should create a date histogram aggregated in months (EDT) ' + test.desc, function (done) {
            var OFFSET_EDT_IN_MINUTES = -4 * 60; // EDT Eastern Daylight Time (GMT-4) in minutes

            this.testClient = new TestClient(mapConfig, 1234);

            this.testClient.getDataview(test.dataviewId, {}, function(err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 15);

                var initialTimestamp = '2007-02-01T00:00:00-04:00'; // EDT midnight
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_EDT_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function(bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_EDT_IN_MINUTES)
                        .add(index, 'month')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_EDT_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should override aggregation in weeks ' + test.desc, function (done) {
            var params = {
                aggregation: 'week'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 61);
                dataview.bins.forEach(function (bin) {
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should override start and end ' + test.desc, function (done) {
            var params = {
                start: 1180659600, // 2007-06-01 01:00:00 UTC => '2007-05-31T21:00:00-04:00'
                end: 1193792400 // 2007-10-31 01:00:00 UTC
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins_count, 6);
                dataview.bins.forEach(function (bin) {
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should cast overridden start and end to float to avoid out of range errors ' + test.desc, function (done) {
            var params = {
                start: -2145916800,
                end: 1193792400
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);

                done();
            });
        });

        it('should aggregate histogram overriding default offset to CEST ' + test.desc, function (done) {
            var OFFSET_CEST_IN_SECONDS = 2 * 3600; // Central European Summer Time (Daylight Saving Time)
            var OFFSET_CEST_IN_MINUTES = 2 * 60; // Central European Summer Time (Daylight Saving Time)
            var params = {
                offset: OFFSET_CEST_IN_SECONDS
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 15);

                var initialTimestamp = '2007-02-01T00:00:00+02:00'; // CEST midnight
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_CEST_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_CEST_IN_MINUTES)
                        .add(index, 'month')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_CEST_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram overriding default offset to UTC/GMT ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 15);

                var initialTimestamp = '2007-02-01T00:00:00Z'; // UTC midnight
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index, 'month')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram using "second" aggregation ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'second'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('datetime_histogram_automatic_second', params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 57);

                var initialTimestamp = '2007-02-15T01:00:00Z';
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index, 'second')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram using "quarter" aggregation ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'quarter'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 6);

                var initialTimestamp = '2007-01-01T00:00:00Z'; // UTC midnight
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index * 3, 'month')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram using "decade" aggregation ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'decade'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('datetime_histogram_automatic_decade', params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 17);

                var initialTimestamp = '1850-01-01T00:00:00Z';
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index * 10, 'year')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram using "century" aggregation ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'century'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('datetime_histogram_automatic_century', params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 14);

                var initialTimestamp = '0601-01-01T00:00:00Z';
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index * 100, 'year')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });

        it('should aggregate histogram using "millennium" aggregation ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var OFFSET_UTC_IN_MINUTES = 0 * 60; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'millennium'
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview('datetime_histogram_automatic_millennium', params, function (err, dataview) {
                assert.ok(!err, err);
                assert.equal(dataview.type, 'histogram');
                assert.ok(dataview.bin_width > 0, 'Unexpected bin width: ' + dataview.bin_width);
                assert.equal(dataview.bins.length, 12);

                var initialTimestamp = '0001-01-01T00:00:00Z';
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_UTC_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .add(index * 1000, 'year')
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_UTC_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });




        it('bins_count should be equal to bins length filtered by start and end ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'quarter',
                start: 1167609600, // 2007-01-01T00:00:00Z, first bin start
                end: 1214870399 // 2008-06-30T23:59:59Z, last bin end
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ifError(err);

                assert.equal(dataview.type, 'histogram');
                assert.equal(dataview.bins.length, 6);
                assert.equal(dataview.bins_count, 6);
                assert.equal(dataview.bins_count, dataview.bins.length);
                done();
            });
        });

        it('bins_count should be greater than bins length filtered by start and end ' + test.desc, function (done) {
            var OFFSET_UTC_IN_SECONDS = 0 * 3600; // UTC
            var params = {
                offset: OFFSET_UTC_IN_SECONDS,
                aggregation: 'quarter',
                start: 1167609600, // 2007-01-01T00:00:00Z, first bin start
                end: 1214870400 // 2008-07-01T00:00:00Z, start the next bin to the last
            };

            this.testClient = new TestClient(mapConfig, 1234);
            this.testClient.getDataview(test.dataviewId, params, function (err, dataview) {
                assert.ifError(err);

                assert.equal(dataview.type, 'histogram');
                assert.equal(dataview.bins.length, 6);
                assert.equal(dataview.bins_count, 7);
                assert.ok(dataview.bins_count > dataview.bins.length);
                done();
            });
        });
    });

    it('should return same histogram ', function (done) {
        var params = {
            start: 1171501200, // 2007-02-15 01:00:00 = min(date_colum)
            end: 1207702800 // 2008-04-09 01:00:00 = max(date_colum)
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_tz', {}, function (err, dataview) {
            assert.ok(!err, err);

            const _testClient = new TestClient(mapConfig, 1234);
            _testClient.getDataview('datetime_histogram_tz', params, function (err, filteredDataview) {
                assert.ok(!err, err);

                assert.deepEqual(dataview, filteredDataview);
                done();
            });
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: second', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_second', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'second');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: minute', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_minute', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'minute');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: hour', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_hour', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'hour');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: day', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_day', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'day');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: week', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_week', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'week');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: month', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_month', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'month');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: quarter', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_quarter', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'quarter');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: year', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_year', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'year');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: decade', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_decade', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'decade');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: century', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_century', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'century');
            done();
        });
    });

    it('should find the best aggregation (automatic mode) to build the histogram: millennium', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('datetime_histogram_automatic_millennium', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'millennium');
            done();
        });
    });



    it('should work with dates', function (done) {
        var params = {};
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getDataview('date_histogram', params, function (err, dataview) {
            assert.ifError(err);
            assert.equal(dataview.type, 'histogram');
            assert.equal(dataview.aggregation, 'year');
            assert.equal(dataview.bins.length, 2);
            assert.equal(dataview.bins_count, 2);
            done();
        });
    });


    it('should not apply offset for a histogram aggregated by minutes', function (done) {
        var self = this;
        var params = {
            offset: '-3600'
        };

        self.testClient = new TestClient(mapConfig, 1234);

        self.testClient.getDataview('minute_histogram', {}, function (err, dataview) {
            assert.ifError(err);
            self.testClient.getDataview('minute_histogram', params, function (err, dataviewWithOffset) {
                assert.ifError(err);

                assert.notEqual(dataview.offset, dataviewWithOffset.offset);
                dataview.offset = dataviewWithOffset.offset;
                assert.deepEqual(dataview, dataviewWithOffset);
                done();
            });
        });
    });

    it('should filter by "start" & "end" for a histogram aggregated by minutes', function (done) {
        var self = this;
        var paramsWithFilter = {
            start: 1171583400, // 2007-02-15 23:50:00 = min(date_colum)
            end: 1171584600 // 2007-02-16 00:10:00 = max(date_colum)
        };

        var paramsWithOffset = {
            start: 1171583400, // 2007-02-15 23:50:00 = min(date_colum)
            end: 1171584600, // 2007-02-16 00:10:00 = max(date_colum)
            offset: '-3600'
        };

        self.testClient = new TestClient(mapConfig, 1234);
        self.testClient.getDataview('minute_histogram', paramsWithFilter, function (err, dataview) {
            assert.ifError(err);

            self.testClient.getDataview('minute_histogram', paramsWithFilter, function (err, filteredDataview) {
                assert.ifError(err);

                assert.deepEqual(dataview, filteredDataview);

                self.testClient.getDataview('minute_histogram', paramsWithOffset,
                function (err, filteredWithOffsetDataview) {
                    assert.ifError(err);

                    assert.notEqual(filteredWithOffsetDataview.offset, filteredDataview.offset);
                    filteredWithOffsetDataview.offset = filteredDataview.offset;
                    assert.deepEqual(filteredWithOffsetDataview, filteredDataview);
                    done();
                });
            });
        });
    });


    it('should return an histogram aggregated by days', function (done) {
        var self = this;
        var paramsWithDailyAgg = {
            aggregation: 'day',
        };

        // data: from 2007-02-15 23:50:00 to 2007-02-16 00:10:00

        var dataviewWithDailyAggFixture = {
            aggregation: 'day',
            bin_width: 86400,
            bins_count: 2,
            bins_start: 1171497600,
            timestamp_start: 1171497600,
            offset: 0,
            nulls: 0,
            bins:
            [{
                bin: 0,
                timestamp: 1171497600,
                min: 1171497600,
                max: 1171497600,
                avg: 1171497600,
                freq: 10
            },
            {
                bin: 1,
                timestamp: 1171584000,
                min: 1171584000,
                max: 1171584000,
                avg: 1171584000,
                freq: 11
            }],
            type: 'histogram'
        };

        self.testClient = new TestClient(mapConfig, 1234);
        self.testClient.getDataview('minute_histogram', paramsWithDailyAgg, function (err, dataview) {
            assert.ifError(err);

            assert.deepEqual(dataview, dataviewWithDailyAggFixture);
            done();
        });
    });

    it('should return a histogram aggregated by days with offset', function (done) {
        var self = this;

        var paramsWithDailyAggAndOffset = {
            aggregation: 'day',
            offset: '-3600'
        };

        // data (UTC): from 2007-02-15 23:50:00 to 2007-02-16 00:10:00

        var dataviewWithDailyAggAndOffsetFixture = {
            aggregation: 'day',
            bin_width: 86400,
            bins_count: 1,
            bins_start: 1171501200,
            timestamp_start: 1171501200,
            nulls: 0,
            offset: -3600,
            bins:
            [{
                bin: 0,
                timestamp: 1171501200,
                min: 1171501200,
                max: 1171501200,
                avg: 1171501200,
                freq: 21
            }],
            type: 'histogram'
        };

        self.testClient = new TestClient(mapConfig, 1234);
        self.testClient.getDataview('minute_histogram', paramsWithDailyAggAndOffset, function (err, dataview) {
            assert.ifError(err);

            assert.deepEqual(dataview, dataviewWithDailyAggAndOffsetFixture);
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

describe('histogram-dates: aggregation input value', function() {

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
                type: "cartodb",
                options: {
                    source: {
                        id: "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
                }
            }
        ],
        {
            agg_value_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'day'
                }
            },
            bad_agg_value_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'wadus'
                }
            }
        },
        [
            {
                id: 'a0',
                type: 'source',
                params: {
                    query: [
                        'select null::geometry the_geom_webmercator, date AS d',
                        'from generate_series(',
                            '\'2007-02-15 01:00:00\'::timestamp,',
                            '\'2008-04-09 01:00:00\'::timestamp,',
                            ' \'1 day\'::interval',
                        ') date'
                    ].join(' ')
                }
            }
        ]
    );

    it('should fail when aggregation values is not valid while instantiating the map', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);
        const override = {
            response: {
                status: 400
            }
        };

        this.testClient.getDataview('bad_agg_value_histogram', override, function(err, dataviewError) {
            assert.ifError(err);

            assert.deepEqual(dataviewError, {
                errors: [
                    'Invalid aggregation value. Valid ones: auto, second, minute, ' +
                    'hour, day, week, month, quarter, year, decade, century, millennium'
                ],
                errors_with_context: [{
                    type: 'unknown',
                    message: [
                        'Invalid aggregation value. ',
                        'Valid ones: auto, second, minute, hour, day, week, month, ' +
                            'quarter, year, decade, century, millennium'
                    ].join('')
                }]
            });

            done();
        });
    });

    it('should fail when aggregation values is not valid while fetching dataview result', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);
        const override = {
            aggregation: 'wadus',
            response: {
                status: 400
            }
        };

        this.testClient.getDataview('agg_value_histogram', override, function(err, dataviewError) {
            assert.ifError(err);

            assert.deepEqual(dataviewError, {
                errors: [
                    'Invalid aggregation value. Valid ones: auto, second, minute, ' +
                    'hour, day, week, month, quarter, year, decade, century, millennium'
                ],
                errors_with_context: [{
                    type: 'unknown',
                    message: [
                        'Invalid aggregation value. ',
                        'Valid ones: auto, second, minute, hour, day, week, month, ' +
                            'quarter, year, decade, century, millennium'
                    ].join('')
                }]
            });

            done();
        });
    });
});

describe('histogram-dates: timestamp starts at epoch', function() {

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
                type: "cartodb",
                options: {
                    source: {
                        id: "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
                }
            }
        ],
        {
            epoch_start_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            }
        },
        [
            {
                id: 'a0',
                type: 'source',
                params: {
                    query: [
                        'select null::geometry the_geom_webmercator, date AS d',
                        'from generate_series(',
                            '\'1970-01-04 10:00:00\'::timestamp,',
                            '\'1984-01-04 10:00:00\'::timestamp,',
                            ' \'1 month\'::interval',
                        ') date'
                    ].join(' ')
                }
            }
        ]
    );

    it('should work when timestamp_start is epoch (1970-01-01 = 0)', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);
        const override = {};

        this.testClient.getDataview('epoch_start_histogram', override, function(err, dataview) {
            assert.ifError(err);

            const { aggregation, timestamp_start } = dataview;

            assert.equal(timestamp_start, 0);
            assert.equal(aggregation, 'quarter');

            done();
        });
    });
});

describe('histogram-dates: trunc timestamp for each bin respecting user\'s timezone', function() {

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
                type: "cartodb",
                options: {
                    source: {
                        id: "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
                }
            }
        ],
        {
            timezone_epoch_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            },
            timezone_epoch_histogram_tz: {
                source: {
                    id: 'a1'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                    aggregation: 'auto'
                }
            }
        },
        [
            {
                id: 'a0',
                type: 'source',
                params: {
                    query: [
                        'select null::geometry the_geom_webmercator, date AS d',
                        'from generate_series(',
                            '\'1970-01-01 00:00:00\'::timestamp,',
                            '\'1970-01-01 01:59:00\'::timestamp,',
                            ' \'1 minute\'::interval',
                        ') date'
                    ].join(' ')
                }
            },
            {
                id: 'a1',
                type: 'source',
                params: {
                    query: [
                        'select null::geometry the_geom_webmercator, date AS d',
                        'from generate_series(',
                            '\'1970-01-01 00:00:00\'::timestamptz,',
                            '\'1970-01-01 01:59:00\'::timestamptz,',
                            ' \'1 minute\'::interval',
                        ') date'
                    ].join(' ')
                }
            }
        ]
    );

    var dateHistogramsUseCases = [{
        desc: 'supporting timestamp with offset',
        dataviewId: 'timezone_epoch_histogram_tz'
    }, {
        desc: 'supporting timestamp without offset',
        dataviewId: 'timezone_epoch_histogram'
    }];

    dateHistogramsUseCases.forEach(function (test) {
        it('should return histogram with two buckets ' + test.desc , function(done) {
            this.testClient = new TestClient(mapConfig, 1234);

            const override = {
                aggregation: 'day',
                offset: '-3600'
            };

            this.testClient.getDataview(test.dataviewId, override, function(err, dataview) {
                assert.ifError(err);

                var OFFSET_IN_MINUTES = -1 * 60; // GMT-01
                var initialTimestamp = '1969-12-31T00:00:00-01:00';
                var binsStartInMilliseconds = dataview.bins_start * 1000;
                var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                    .utcOffset(OFFSET_IN_MINUTES)
                    .format();
                assert.equal(binsStartFormatted, initialTimestamp);

                dataview.bins.forEach(function (bin, index) {
                    var binTimestampExpected = moment.utc(initialTimestamp)
                        .utcOffset(OFFSET_IN_MINUTES)
                        .add(index, override.aggregation)
                        .format();
                    var binsTimestampInMilliseconds = bin.timestamp * 1000;
                    var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                        .utcOffset(OFFSET_IN_MINUTES)
                        .format();

                    assert.equal(binTimestampFormatted, binTimestampExpected);
                    assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                    assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
                });

                done();
            });
        });
    });
});


describe('histogram: be able to override with aggregation for histograms instantiated w/o aggregation', function() {

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
                type: "cartodb",
                options: {
                    source: {
                        id: "a0"
                    },
                    cartocss: "#points { marker-width: 10; marker-fill: red; }",
                    cartocss_version: "2.3.0"
                }
            }
        ],
        {
            timezone_epoch_histogram: {
                source: {
                    id: 'a0'
                },
                type: 'histogram',
                options: {
                    column: 'd',
                }
            }
        },
        [
            {
                id: 'a0',
                type: 'source',
                params: {
                    query: [
                        'select null::geometry the_geom_webmercator, date AS d',
                        'from generate_series(',
                            '\'1970-01-01 00:00:00\'::timestamp,',
                            '\'1970-01-01 01:59:00\'::timestamp,',
                            ' \'1 minute\'::interval',
                        ') date'
                    ].join(' ')
                }
            }
        ]
    );

    it('should apply aggregation to the histogram', function(done) {
        this.testClient = new TestClient(mapConfig, 1234);

        const override = {
            aggregation: 'day',
            offset: '-3600'
        };

        this.testClient.getDataview('timezone_epoch_histogram', override, function(err, dataview) {
            assert.ifError(err);

            var OFFSET_IN_MINUTES = -1 * 60; // GMT-01
            var initialTimestamp = '1969-12-31T00:00:00-01:00';
            var binsStartInMilliseconds = dataview.bins_start * 1000;
            var binsStartFormatted = moment.utc(binsStartInMilliseconds)
                .utcOffset(OFFSET_IN_MINUTES)
                .format();
            assert.equal(binsStartFormatted, initialTimestamp);

            dataview.bins.forEach(function (bin, index) {
                var binTimestampExpected = moment.utc(initialTimestamp)
                    .utcOffset(OFFSET_IN_MINUTES)
                    .add(index, override.aggregation)
                    .format();
                var binsTimestampInMilliseconds = bin.timestamp * 1000;
                var binTimestampFormatted = moment.utc(binsTimestampInMilliseconds)
                    .utcOffset(OFFSET_IN_MINUTES)
                    .format();

                assert.equal(binTimestampFormatted, binTimestampExpected);
                assert.ok(bin.timestamp <= bin.min, 'bin timestamp < bin min: ' + JSON.stringify(bin));
                assert.ok(bin.min <= bin.max, 'bin min < bin max: ' + JSON.stringify(bin));
            });

            done();
        });
    });
});
