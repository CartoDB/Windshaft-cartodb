var assert = require('../../support/assert');
var step = require('step');

var url = require('url');
var queue = require('queue-async');

var helper = require('../../support/test_helper');

var CartodbWindshaft = require('../../../lib/cartodb/server');
var serverOptions = require('../../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../../../lib/cartodb/models/layergroup-token');

describe('named-maps widgets', function() {

    var username = 'localhost';
    var widgetsTemplateName = 'widgets-template';

    var layergroupid;
    var layergroup;
    var keysToDelete;

    beforeEach(function(done) {
        keysToDelete = {};

        var widgetsTemplate =  {
            version: '0.0.1',
            name: widgetsTemplateName,
            layergroup:  {
                version: '1.5.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: "select * from populated_places_simple_reduced_private",
                            cartocss: '#layer { marker-fill: blue; }',
                            cartocss_version: '2.3.0',
                            widgets: {
                                pop_max_formula_sum: {
                                    type: 'formula',
                                    options: {
                                        column: 'pop_max',
                                        operation: 'sum'
                                    }
                                },
                                country_places_count: {
                                    type: 'aggregation',
                                    options: {
                                        column: 'adm0_a3',
                                        aggregation: 'count'
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
            }
        };

        var template_params = {};

        step(
            function createTemplate()
            {
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named?api_key=1234',
                        method: 'POST',
                        headers: {
                            host: username,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(widgetsTemplate)
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function instantiateTemplate(err, res) {
                assert.ifError(err);

                assert.deepEqual(JSON.parse(res.body), { template_id: widgetsTemplateName });
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named/' + widgetsTemplateName,
                        method: 'POST',
                        headers: {
                            host: username,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(template_params)
                    },
                    {
                        status: 200
                    },
                    function(res) {
                        next(null, res);
                    }
                );
            },
            function finish(err, res) {
                assert.ifError(err);

                layergroup = JSON.parse(res.body);
                assert.ok(layergroup.hasOwnProperty('layergroupid'), "Missing 'layergroupid' from: " + res.body);
                layergroupid = layergroup.layergroupid;

                keysToDelete['map_cfg|' + LayergroupToken.parse(layergroup.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                return done();
            }
        );

    });

    afterEach(function(done) {
        step(
            function deleteTemplate(err) {
                assert.ifError(err);
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named/' + widgetsTemplateName + '?api_key=1234',
                        method: 'DELETE',
                        headers: {
                            host: username
                        }
                    },
                    {
                        status: 204
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function deleteRedisKeys(err) {
                assert.ifError(err);
                helper.deleteRedisKeys(keysToDelete, done);
            }
        );
    });

    function getWidget(widgetName, callback) {
        assert.response(
            server,
            {
                url: '/api/v1/map/' + layergroupid + '/0/widget/' + widgetName,
                method: 'GET',
                headers: {
                    host: username
                }
            },
            {
                status: 200
            },
            function(res, err) {
                if (err) {
                    return callback(err);
                }
                var parsedBody = JSON.parse(res.body);
                return callback(err, res, parsedBody);
            }
        );
    }

    it('should be able to retrieve widgets from all URLs', function(done) {
        var widgetsPaths = layergroup.metadata.layers.reduce(function(paths, layer) {
            var widgets = layer.widgets || {};
            Object.keys(widgets).forEach(function(widget) {
                paths.push(url.parse(widgets[widget].url.http).path);
            });

            return paths;
        }, []);

        var widgetsQueue = queue(widgetsPaths.length);

        widgetsPaths.forEach(function(path) {
            widgetsQueue.defer(function(path, done) {
                assert.response(
                    server,
                    {
                        url: path,
                        method: 'GET',
                        headers: {
                            host: username
                        }
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        if (err) {
                            return done(err);
                        }
                        var parsedBody = JSON.parse(res.body);
                        return done(null, parsedBody);
                    }
                );
            }, path);
        });

        widgetsQueue.awaitAll(function(err, results) {
            assert.equal(results.length, 3);
            done(err);
        });
    });


    it("should retrieve aggregation", function(done) {
        getWidget('country_places_count', function(err, response, aggregation) {
            assert.ok(!err, err);

            assert.equal(aggregation.type, 'aggregation');
            assert.equal(aggregation.max, 769);

            return done();
        });
    });

    it("should retrieve histogram", function(done) {
        getWidget('pop_max', function(err, response, histogram) {
            assert.ok(!err, err);

            assert.equal(histogram.type, 'histogram');
            assert.equal(histogram.bin_width, 743250);

            return done();
        });
    });

});
