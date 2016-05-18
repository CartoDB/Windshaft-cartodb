require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('dataviews using tables without overviews', function() {

    var countMapConfig =  {
        version: '1.5.0',
        analyses: [
            { id: 'data-source',
                type: 'source',
                params: {
                  query: 'select * from populated_places_simple_reduced'
                }
            }
        ],
        dataviews:  {
            country_places_count: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'adm0_a3',
                    operation: 'count'
                }
            },
            country_categories: {
                type: 'aggregation',
                source: {id: 'data-source'},
                options: {
                    column: 'adm0_a3',
                    aggregation: 'count'
                }
            }
        },
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    source: { id: 'data-source' }
                }
            }
        ]
    };

    it("should expose a formula", function(done) {
        var testClient = new TestClient(countMapConfig);
        testClient.getDataview('country_places_count', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, { operation: 'count', result: 7313, nulls: 0, type: 'formula' });

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('category', function () {

            it("should expose a filtered formula", function (done) {
                var params = {
                    filters: {
                        dataviews: {country_categories: {accept: ['CAN']}}
                    }
                };
                var testClient = new TestClient(countMapConfig);
                testClient.getDataview('country_places_count', params, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, { operation: 'count', result: 256, nulls: 0, type: 'formula' });
                    testClient.drain(done);
                });
            });
        });

    });
});

describe('dataviews using tables with overviews', function() {

    var sumMapConfig =  {
        version: '1.5.0',
        analyses: [
            { id: 'data-source',
                type: 'source',
                params: {
                  query: 'select * from test_table_overviews'
                }
            }
        ],
        dataviews:  {
            test_sum: {
                type: 'formula',
                source: {id: 'data-source'},
                options: {
                    column: 'value',
                    operation: 'sum'
                }
            },
            test_categories: {
                type: 'aggregation',
                source: {id: 'data-source'},
                options: {
                    column: 'name',
                    aggregation: 'count',
                    aggregationColumn: 'name',
                }
            }
        },
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: 'select * from test_table_overviews',
                    cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                    cartocss_version: '2.3.0',
                    source: { id: 'data-source' }
                }
            }
        ]
    };

    it("should expose a formula", function(done) {
        var testClient = new TestClient(sumMapConfig);
        testClient.getDataview('test_sum', { own_filter: 0 }, function(err, formula_result) {
            if (err) {
                return done(err);
            }
            assert.deepEqual(formula_result, {"operation":"sum","result":15,"nulls":0,"type":"formula"});

            testClient.drain(done);
        });
    });

    describe('filters', function() {

        describe('category', function () {

            it("should expose a filtered formula", function (done) {
                var params = {
                    filters: {
                        dataviews: {test_categories: {accept: ['Hawai']}}
                    }
                };
                var testClient = new TestClient(sumMapConfig);
                testClient.getDataview('test_sum', params, function (err, formula_result) {
                    if (err) {
                        return done(err);
                    }
                    assert.deepEqual(formula_result, {"operation":"sum","result":1,"nulls":0,"type":"formula"});
                    testClient.drain(done);
                });
            });
        });

    });
});
