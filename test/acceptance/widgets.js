var assert = require('../support/assert');
var step = require('step');
var qs = require('querystring');

var helper = require(__dirname + '/../support/test_helper');
var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);


describe('widgets', function() {

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        helper.deleteRedisKeys(keysToDelete, done);
    });

    function getWidget(mapConfig, widgetName, params, callback) {
        if (!callback) {
            callback = params;
            params = null;
        }

        var url = '/api/v1/map';
        if (params && params.filters) {
            url += '?' + qs.stringify({ filters: JSON.stringify(params.filters) });
        }

        var layergroupId;
        step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: url,
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(mapConfig)
                    },
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    },
                    function(res, err) {
                        if (err) {
                            return next(err);
                        }
                        var parsedBody = JSON.parse(res.body);
                        var expectedWidgetURLS = {
                            http: "/api/v1/map/" + parsedBody.layergroupid + "/0/widget/" + widgetName
                        };
                        assert.ok(parsedBody.metadata.layers[0].widgets[widgetName]);
                        assert.ok(
                            parsedBody.metadata.layers[0].widgets[widgetName].url.http.match(expectedWidgetURLS.http)
                        );
                        return next(null, parsedBody.layergroupid);
                    }
                );
            },
            function getWidgetResult(err, _layergroupId) {
                assert.ifError(err);

                var next = this;
                layergroupId = _layergroupId;

                var url = '/api/v1/map/' + layergroupId + '/0/widget/' + widgetName;
                if (params && params.bbox) {
                    url += '?' + qs.stringify({bbox: params.bbox});
                }
                assert.response(server,
                    {
                        url: url,
                        method: 'GET',
                        headers: {
                            host: 'localhost'
                        }
                    },
                    {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    },
                    function(res, err) {
                        if (err) {
                            return next(err);
                        }

                        next(null, res);
                    }
                );
            },
            function finish(err, res) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                return callback(err, res);
            }
        );
    }


    it("should expose layer list", function(done) {

        var listWidgetMapConfig =  {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from test_table',
                        cartocss: '#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }',
                        cartocss_version: '2.3.0',
                        widgets: {
                            names: {
                                type: 'list',
                                options: {
                                    columns: ['name']
                                }
                            }
                        }
                    }
                }
            ]
        };

        getWidget(listWidgetMapConfig, 'names', function(err, res) {
            if (err) {
                return done(err);
            }

            var expectedList = [
                {name:"Hawai"},
                {name:"El Estocolmo"},
                {name:"El Rey del Tallarín"},
                {name:"El Lacón"},
                {name:"El Pico"}
            ];
            assert.deepEqual(JSON.parse(res.body).rows, expectedList);

            done();
        });
    });

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
        getWidget(histogramMapConfig, 'pop_max', function(err, res) {
            if (err) {
                return done(err);
            }

            var histogram = JSON.parse(res.body);
            assert.ok(histogram.bins.length);

            done();
        });
    });

    describe('filters', function() {

        describe('category', function() {
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
                getWidget(aggregationMapConfig, 'country_places_count', function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);
                    assert.equal(aggregation.categories.length, 223);
                    assert.deepEqual(aggregation.categories[0], { count: 769, adm0_a3: 'USA' });

                    done();
                });
            });

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {country_places_count: {accept: ['CAN']}}
                        ]
                    }
                };
                getWidget(aggregationMapConfig, 'country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);
                    assert.equal(aggregation.categories.length, 1);
                    assert.deepEqual(aggregation.categories[0], { count: 256, adm0_a3: 'CAN' });

                    done();
                });
            });
        });

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

            it("should expose an aggregation", function(done) {
                getWidget(histogramMapConfig, 'country_places_histogram', function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(histogram.bins[0], { bin: 0, min: 0, max: 3917000, freq: 7229 });

                    done();
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
                getWidget(histogramMapConfig, 'country_places_histogram', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var histogram = JSON.parse(res.body);
                    // notice min value
                    assert.deepEqual(histogram.bins[0], { bin: 0, min: 4009000, max: 7297054, freq: 50 });

                    done();
                });
            });
        });

        describe('combine widget filters', function() {
            var combinedWidgetsMapConfig =  {
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
                                },
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

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_count: { reject: ['CHN'] }
                            }
                        ]
                    }
                };
                getWidget(combinedWidgetsMapConfig, 'country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], {"count":769,"adm0_a3":"USA"});

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.adm0_a3 === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    done();
                });
            });

            it("should expose a filtered aggregation", function(done) {
                var params = {
                    filters: {
                        layers: [
                            {
                                country_places_count: { reject: ['CHN'] },
                                country_places_histogram: { min: 7000000 }
                            }
                        ]
                    }
                };
                getWidget(combinedWidgetsMapConfig, 'country_places_count', params, function(err, res) {
                    if (err) {
                        return done(err);
                    }

                    var aggregation = JSON.parse(res.body);

                    // first one would be CHN if reject filter wasn't applied
                    assert.deepEqual(aggregation.categories[0], { count: 4, adm0_a3: 'IND' });

                    // confirm 'CHN' was filtered out (reject)
                    assert.equal(aggregation.categories.reduce(function(sum, row) {
                        return sum + (row.adm0_a3 === 'CHN' ? 1 : 0);
                    }, 0), 0);

                    done();
                });
            });
        });
    });

});
