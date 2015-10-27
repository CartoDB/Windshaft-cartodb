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

    function getWidget(mapConfig, widgetName, filters, callback) {
        if (!callback) {
            callback = filters;
            filters = null;
        }

        var url = '/api/v1/map';
        if (filters) {
            url += '?' + qs.stringify({filters: JSON.stringify(filters)});
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
                            "http": "http://localhost.localhost.lan:8888" +
                                    "/api/v1/map/" + parsedBody.layergroupid + "/0/widget/" + widgetName
                        };
                        assert.ok(parsedBody.metadata.layers[0].widgets[widgetName]);
                        assert.equal(parsedBody.metadata.layers[0].widgets[widgetName].url.http, expectedWidgetURLS.http);
                        return next(null, parsedBody.layergroupid);
                    }
                );
            },
            function getWidgetResult(err, _layergroupId) {
                assert.ifError(err);

                var next = this;
                layergroupId = _layergroupId;

                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/0/widget/' + widgetName,
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

        var layergroup =  {
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

        getWidget(layergroup, 'names', function(err, res) {
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
            assert.deepEqual(JSON.parse(res.body), expectedList);

            done();
        });
    });

    it("should expose layer histogram", function(done) {
        var layergroup =  {
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
        getWidget(layergroup, 'pop_max', function(err, res) {
            if (err) {
                return done(err);
            }

            var histogram = JSON.parse(res.body);
            assert.ok(histogram.length);

            done();
        });
    });

});
