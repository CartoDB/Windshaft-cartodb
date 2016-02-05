require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('aggregation widgets', function() {

    var aggregationMapConfig =  {
        version: '1.5.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    widgets: {
                        country_places_count: {
                            type: 'aggregation',
                            options: {
                                column: 'adm0_a3',
                                aggregation: 'count'
                            }
                        }
                    }
                }
            }
        ]
    };

    it("should expose an aggregation", function(done) {
        var testClient = new TestClient(aggregationMapConfig);
        testClient.getWidget('country_places_count', { own_filter: 0 }, function(err, res) {
            if (err) {
                return done(err);
            }

            var aggregation = JSON.parse(res.body);
            assert.equal(aggregation.categories.length, 6);
            assert.deepEqual(aggregation.categories[0], { value: 769, category: 'USA', agg: false });

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('category', function () {

            it("should expose a filtered aggregation", function (done) {
                var params = {
                    filters: {
                        layers: [
                            {country_places_count: {accept: ['CAN']}}
                        ]
                    }
                };
                var testClient = new TestClient(aggregationMapConfig);
                testClient.getWidget('country_places_count', params, function (err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);
                    assert.equal(aggregation.categories.length, 1);
                    assert.deepEqual(aggregation.categories[0], { value: 256, category: 'CAN', agg: false });

                    testClient.drain(done);
                });
            });
        });

    });
});
