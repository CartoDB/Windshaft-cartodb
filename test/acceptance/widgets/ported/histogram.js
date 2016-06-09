require('../../../support/test_helper');

var assert        = require('../../../support/assert');
var TestClient = require('../../../support/test-client');

describe('widgets', function() {

    describe('histograms', function() {

        afterEach(function(done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        function histogramsMapConfig(widgets) {
            return {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            widgets: widgets || {
                                scalerank: {
                                    type: 'histogram',
                                    options: {
                                        column: 'scalerank'
                                    }
                                },
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
        }

        it('can be fetched from a valid histogram', function(done) {
            this.testClient = new TestClient(histogramsMapConfig());
            this.testClient.getWidget('scalerank', function (err, res, histogram) {
                assert.ok(!err, err);
                assert.ok(histogram);
                assert.equal(histogram.type, 'histogram');
                validateHistogramBins(histogram);

                assert.ok(histogram.bins.length);

                assert.deepEqual(histogram.bins[0], { bin: 0, freq: 179, min: 1, max: 1, avg: 1 });

                done();
            });
        });

        it('can be fetched from a valid histogram', function(done) {
            this.testClient = new TestClient(histogramsMapConfig());
            this.testClient.getWidget('pop_max', function (err, res, histogram) {
                assert.ok(!err, err);
                assert.ok(histogram);
                assert.equal(histogram.type, 'histogram');
                validateHistogramBins(histogram);

                assert.ok(histogram.bins.length);

                assert.deepEqual(
                    histogram.bins[histogram.bins.length - 1],
                    { bin: 47, freq: 1, min: 35676000, max: 35676000, avg: 35676000 }
                );

                done();
            });
        });

        it('can be fetched from a valid filtered histogram', function(done) {
            this.testClient = new TestClient(histogramsMapConfig());
            var popMaxFilter = {
                pop_max: {
                    min: 1e5,
                    max: 1e7
                }
            };
            var params = {
                own_filter: 1,
                filters: {
                    layers: [popMaxFilter]
                }
            };
            this.testClient.getWidget('pop_max', params, function (err, res, histogram) {
                assert.ok(!err, err);
                assert.ok(histogram);
                assert.equal(histogram.type, 'histogram');
                validateHistogramBins(histogram);

                assert.ok(histogram.bins.length);

                assert.deepEqual(
                    histogram.bins[histogram.bins.length - 1],
                    { bin: 7, min: 8829000, max: 9904000, avg: 9340914.714285715, freq: 7 }
                );

                done();
            });
        });

        it('returns array with freq=0 entries for empty bins', function(done) {
            var histogram20binsMapConfig = {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
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

            this.testClient = new TestClient(histogram20binsMapConfig);
            this.testClient.getWidget('pop_max', { start: 0, end: 35676000, bins: 20 }, function (err, res, histogram) {
                assert.ok(!err, err);
                assert.equal(histogram.type, 'histogram');
                validateHistogramBins(histogram);
                assert.ok(histogram.bins.length);
                assert.deepEqual(
                    histogram.bins[histogram.bins.length - 1],
                    { bin: 19, freq: 1, min: 35676000, max: 35676000, avg: 35676000 }
                );

                var emptyBin = histogram.bins[18];
                assert.ok(!emptyBin);

                done();
            });
        });

        it('can use a fixed number of bins', function(done) {
            var fixedBinsHistogramMapConfig = histogramsMapConfig({
                pop_max: {
                    type: 'histogram',
                    options: {
                        column: 'pop_max'
                    }
                }
            });

            this.testClient = new TestClient(fixedBinsHistogramMapConfig);
            this.testClient.getWidget('pop_max', { bins: 5 }, function (err, res, histogram) {
                assert.ok(!err, err);
                assert.equal(histogram.type, 'histogram');

                assert.equal(histogram.bins_count, 5);

                validateHistogramBins(histogram);

                assert.ok(histogram.bins.length);
                assert.deepEqual(
                    histogram.bins[0],
                    { bin: 0, min: 0, max: 7067423, avg: 280820.0057731959, freq: 7275 }
                );
                assert.deepEqual(
                    histogram.bins[histogram.bins.length - 1],
                    { bin: 4, freq: 1, min: 35676000, max: 35676000, avg: 35676000 }
                );

                done();
            });
        });

        function validateHistogramBins(histogram) {
            var binWidth = histogram.bin_width;
            var start = histogram.bins_start;
            var end = start + (histogram.bins_count * binWidth);

            var firstBin = histogram.bins[0];
            assert.equal(firstBin.min, start,
                'First bin does not match min and start ' + JSON.stringify({
                    min: firstBin.min,
                    start: start
                })
            );

            var lastBin = histogram.bins[histogram.bins.length - 1];
            assert.equal(lastBin.max, end,
                'Last bin does not match max and end ' + JSON.stringify({
                    max: lastBin.max,
                    end: end
                })
            );

            function getBinStartEnd(binIndex) {
                return {
                    start: start + (binIndex * binWidth),
                    end: start + ((binIndex + 1) * binWidth)
                };
            }

            histogram.bins.forEach(function(bin) {
                var binStartEnd = getBinStartEnd(bin.bin);

                assert.ok(binStartEnd.start <= bin.min,
                    'Bin start bigger than bin min ' + JSON.stringify({
                        bin: bin.bin,
                        min: bin.min,
                        start: binStartEnd.start
                    })
                );

                assert.ok(binStartEnd.end >= bin.max,
                    'Bin end smaller than bin max ' + JSON.stringify({
                        bin: bin.bin,
                        max: bin.max,
                        end: binStartEnd.end
                    })
                );

                assert.ok(bin.avg >= bin.min && bin.avg <= bin.max,
                        'Bin avg not between min and max values' + JSON.stringify({
                        bin: bin.bin,
                        avg: bin.avg,
                        min: bin.min,
                        max: bin.max
                    })
                );
            });
        }

        describe('datetime column', function() {
            afterEach(function(done) {
                if (this.testClient) {
                    this.testClient.drain(done);
                } else {
                    done();
                }
            });

            var updatedAtFilter = {
                updated_at: {
                    min: 0
                }
            };

            it('can use a datetime column', function(done) {
                this.testClient = new TestClient(histogramsMapConfig({
                    updated_at: {
                        type: 'histogram',
                        options: {
                            column: 'updated_at'
                        }
                    }
                }));
                this.testClient.getWidget('updated_at', function (err, res, histogram) {
                    assert.ok(!err, err);
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');

                    assert.ok(histogram.bins.length);

                    done();
                });
            });

            it('can use a datetime filtered column', function(done) {
                this.testClient = new TestClient(histogramsMapConfig({
                    updated_at: {
                        type: 'histogram',
                        options: {
                            column: 'updated_at'
                        }
                    }
                }));
                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [updatedAtFilter]
                    }
                };
                this.testClient.getWidget('updated_at', params, function (err, res, histogram) {
                    assert.ok(!err, err);
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');

                    assert.ok(histogram.bins.length);

                    done();
                });
            });

            it('can getTile with datetime filtered column', function(done) {
                this.testClient = new TestClient(histogramsMapConfig({
                    updated_at: {
                        type: 'histogram',
                        options: {
                            column: 'updated_at'
                        }
                    }
                }));
                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [updatedAtFilter]
                    }
                };
                this.testClient.getTile(0, 0, 0, params, function (err, res, tile) {
                    assert.ok(!err, err);
                    assert.ok(tile);

                    done();
                });
            });

            it('can use two columns with different types', function(done) {
                this.testClient = new TestClient(histogramsMapConfig({
                    updated_at: {
                        type: 'histogram',
                        options: {
                            column: 'updated_at'
                        }
                    },
                    pop_max: {
                        type: 'histogram',
                        options: {
                            column: 'pop_max'
                        }
                    }
                }));

                var popMaxFilter = {
                    pop_max: {
                        max: 1e7
                    }
                };

                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [popMaxFilter]
                    }
                };

                this.testClient.getWidget('updated_at', params, function (err, res, histogram) {
                    assert.ok(!err, err);
                    assert.ok(histogram);
                    assert.equal(histogram.type, 'histogram');

                    assert.ok(histogram.bins.length);

                    done();
                });
            });
        });

    });

});
