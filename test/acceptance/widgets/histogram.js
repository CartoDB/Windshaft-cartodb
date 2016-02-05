require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('histogram widgets', function() {

    it("should expose layer histogram", function(done) {
        var histogramMapConfig =  {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            pop_max: {
                                type: 'histogram',
                                options: {
                                    column: 'pop_max'
                                }
                            }
                        }
                    }
                }
            ]
        };

        var testClient = new TestClient(histogramMapConfig);

        testClient.getWidget('pop_max', function(err, res) {
            if (err) {
                return done(err);
            }

            var histogram = JSON.parse(res.body);
            assert.ok(histogram.bins.length);

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('range', function() {
            var histogramMapConfig =  {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                            cartocss_version: '2.3.0',
                            widgets: {
                                country_places_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'pop_max'
                                    }
                                }
                            }
                        }
                    }
                ]
            };

            it("should expose an histogram", function(done) {
                var testClient = new TestClient(histogramMapConfig);
                testClient.getWidget('country_places_histogram', { own_filter: 0 }, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(
                        histogram.bins[0],
                        { bin: 0, freq: 6497, min: 0, max: 742572, avg: 113511.16823149147 }
                    );

                    testClient.drain(done);
                });
            });

            it("should expose a filtered histogram", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_histogram: { min: 4000000 }
                            }
                        ]
                    }
                };
                var testClient = new TestClient(histogramMapConfig);
                testClient.getWidget('country_places_histogram', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(histogram.bins[0], {
                        bin: 0,
                        freq: 62,
                        min: 4000000,
                        max: 9276403,
                        avg: 5815009.596774193
                    });

                    testClient.drain(done);
                });
            });
        });
    });

});
