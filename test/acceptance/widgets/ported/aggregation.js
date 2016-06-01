require('../../../support/test_helper');

var assert = require('../../../support/assert');
var TestClient = require('../../../support/test-client');

describe('widgets', function() {

    describe('aggregations', function() {

        afterEach(function(done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });


        var aggregationMapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        widgets: {
                            adm0name: {
                                type: 'aggregation',
                                options: {
                                    column: 'adm0name',
                                    aggregation: 'count'
                                }
                            }
                        }
                    }
                }
            ]
        };

        it('can be fetched from a valid aggregation', function(done) {
            this.testClient = new TestClient(aggregationMapConfig);
            this.testClient.getWidget('adm0name', { own_filter: 0 }, function (err, res, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');

                assert.equal(aggregation.categories.length, 6);

                assert.deepEqual(
                    aggregation.categories[0],
                    { category: 'United States of America', value: 769, agg: false }
                );

                assert.deepEqual(
                    aggregation.categories[aggregation.categories.length - 1],
                    { category: 'Other', value: 4914, agg: true }
                );

                done();
            });
        });

        var filteredCategoriesScenarios = [
            { accept: ['Canada'], values: [256] },
            { accept: ['Canada', 'Spain', 'Chile', 'Thailand'], values: [256, 49, 83, 79] },
            { accept: ['Canada', 'Spain', 'Chile', 'Thailand', 'Japan'], values: [256, 49, 83, 79, 69] },
            { accept: ['Canada', 'Spain', 'Chile', 'Thailand', 'Japan', 'France'], values: [256, 49, 83, 79, 69, 71] },
            {
                accept: ['United States of America', 'Canada', 'Spain', 'Chile', 'Thailand', 'Japan', 'France'],
                values: [769, 256, 49, 83, 79, 69, 71]
            }
        ];

        filteredCategoriesScenarios.forEach(function(scenario) {
            it('can filter some categories: ' + scenario.accept.join(', '), function(done) {
                this.testClient = new TestClient(aggregationMapConfig);
                var adm0nameFilter = {
                    adm0name: {
                        accept: scenario.accept
                    }
                };
                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [
                            adm0nameFilter
                        ]
                    }
                };
                this.testClient.getWidget('adm0name', params, function (err, res, aggregation) {
                    assert.ok(!err, err);
                    assert.ok(aggregation);
                    assert.equal(aggregation.type, 'aggregation');

                    assert.equal(aggregation.categories.length, scenario.accept.length);

                    var categoriesByCategory = aggregation.categories.reduce(function(byCategory, row) {
                        byCategory[row.category] = row;
                        return byCategory;
                    }, {});

                    var scenarioByCategory = scenario.accept.reduce(function(byCategory, category, index) {
                        byCategory[category] = { category: category, value: scenario.values[index], agg: false };
                        return byCategory;
                    }, {});

                    Object.keys(categoriesByCategory).forEach(function(category) {
                        assert.deepEqual(categoriesByCategory[category], scenarioByCategory[category]);
                    });

                    done();
                });
            });
        });

        var aggregationSumMapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        widgets: {
                            adm0name: {
                                type: 'aggregation',
                                options: {
                                    column: 'adm0name',
                                    aggregation: 'sum',
                                    aggregationColumn: 'pop_max'
                                }
                            }
                        }
                    }
                }
            ]
        };

        it('can sum other column for aggregation value', function(done) {

            this.testClient = new TestClient(aggregationSumMapConfig);
            this.testClient.getWidget('adm0name', { own_filter: 0 }, function (err, res, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');

                assert.equal(aggregation.categories.length, 6);

                assert.deepEqual(
                    aggregation.categories[0],
                    { category: 'China', value: 374537585, agg: false }
                );

                assert.deepEqual(
                    aggregation.categories[aggregation.categories.length - 1],
                    { category: 'Other', value: 1412626289, agg: true }
                );

                done();
            });
        });

        var filteredCategoriesSumScenarios = [
            { accept: [], values: [] },
            { accept: ['Canada'], values: [23955084] },
            { accept: ['Canada', 'Spain', 'Chile', 'Thailand'], values: [23955084, 22902774, 14356263, 17492483] },
            {
                accept: ['United States of America', 'Canada', 'Spain', 'Chile', 'Thailand', 'Japan', 'France'],
                values: [239098994, 23955084, 22902774, 14356263, 17492483, 93577001, 25473876]
            }
        ];

        filteredCategoriesSumScenarios.forEach(function(scenario) {
            it('can filter some categories with sum aggregation: ' + scenario.accept.join(', '), function(done) {
                this.testClient = new TestClient(aggregationSumMapConfig);
                var adm0nameFilter = {
                    adm0name: {
                        accept: scenario.accept
                    }
                };
                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [
                            adm0nameFilter
                        ]
                    }
                };
                this.testClient.getWidget('adm0name', params, function (err, res, aggregation) {
                    assert.ok(!err, err);
                    assert.ok(aggregation);
                    assert.equal(aggregation.type, 'aggregation');

                    assert.equal(aggregation.categories.length, scenario.accept.length);

                    var categoriesByCategory = aggregation.categories.reduce(function(byCategory, row) {
                        byCategory[row.category] = row;
                        return byCategory;
                    }, {});

                    var scenarioByCategory = scenario.accept.reduce(function(byCategory, category, index) {
                        byCategory[category] = { category: category, value: scenario.values[index], agg: false };
                        return byCategory;
                    }, {});

                    Object.keys(categoriesByCategory).forEach(function(category) {
                        assert.deepEqual(categoriesByCategory[category], scenarioByCategory[category]);
                    });

                    done();
                });
            });
        });

        var numericAggregationMapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            scalerank: {
                                type: 'aggregation',
                                options: {
                                    column: 'scalerank',
                                    aggregation: 'count'
                                }
                            }
                        }
                    }
                }
            ]
        };

        ['1', 1].forEach(function(filterValue) {
            it('can filter numeric categories: ' + (typeof filterValue), function(done) {
                this.testClient = new TestClient(numericAggregationMapConfig);
                var scalerankFilter = {
                    scalerank: {
                        accept: [filterValue]
                    }
                };
                var params = {
                    own_filter: 1,
                    filters: {
                        layers: [scalerankFilter]
                    }
                };
                this.testClient.getWidget('scalerank', params, function (err, res, aggregation) {
                    assert.ok(!err, err);
                    assert.ok(aggregation);
                    assert.equal(aggregation.type, 'aggregation');

                    assert.equal(aggregation.categories.length, 1);
                    assert.deepEqual(aggregation.categories[0], { category: '1', value: 179, agg: false });

                    done();
                });
            });
        });

        describe('search', function() {
            afterEach(function(done) {
                if (this.testClient) {
                    this.testClient.drain(done);
                } else {
                    done();
                }
            });

            ['1', 1].forEach(function(userQuery) {
                it('can search numeric categories: ' + (typeof userQuery), function(done) {
                    this.testClient = new TestClient(numericAggregationMapConfig);
                    var scalerankFilter = {
                        scalerank: {
                            accept: [userQuery]
                        }
                    };
                    var params = {
                        own_filter: 0,
                        filters: {
                            layers: [scalerankFilter]
                        }
                    };
                    this.testClient.widgetSearch('scalerank', userQuery, params, function (err, res, searchResult) {
                        assert.ok(!err, err);
                        assert.ok(searchResult);
                        assert.equal(searchResult.type, 'aggregation');

                        assert.equal(searchResult.categories.length, 2);
                        assert.deepEqual(
                            searchResult.categories,
                            [{ category: 10, value: 515 }, { category: 1, value: 179 }]
                        );

                        done();
                    });
                });
            });

            var adm0name = 'Argentina';
            [adm0name, adm0name.toLowerCase(), adm0name.toUpperCase()].forEach(function(userQuery) {
                it('should search with case insensitive: ' + userQuery, function(done) {
                    this.testClient = new TestClient(aggregationMapConfig);
                    this.testClient.widgetSearch('adm0name', userQuery, function (err, res, searchResult) {
                        assert.ok(!err, err);
                        assert.ok(searchResult);
                        assert.equal(searchResult.type, 'aggregation');

                        assert.equal(searchResult.categories.length, 1);
                        assert.deepEqual(
                            searchResult.categories,
                            [{ category:"Argentina", value:159 }]
                        );

                        done();
                    });
                });
            });
        });

    });

});
