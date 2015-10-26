var assert      = require('../support/assert');
var step        = require('step');

var helper = require(__dirname + '/../support/test_helper');
var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);


describe('lists', function() {

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        helper.deleteRedisKeys(keysToDelete, done);
    });


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

        var layergroupId;
        step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
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
                                    "/api/v1/map/adfb1f912ddb9a5af5e9ef0b2229ed3b:1234567890123/0/widget/names"
                        };
                        assert.ok(parsedBody.metadata.layers[0].widgets.names);
                        assert.equal(parsedBody.metadata.layers[0].widgets.names.url.http, expectedWidgetURLS.http);
                        return next(null, parsedBody.layergroupid);
                    }
                );
            },
            function getList(err, _layergroupId) {
                assert.ifError(err);

                var next = this;
                layergroupId = _layergroupId;

                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/0/widget/names',
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

                        var expectedList = [
                            {name:"Hawai"},
                            {name:"El Estocolmo"},
                            {name:"El Rey del Tallarín"},
                            {name:"El Lacón"},
                            {name:"El Pico"}
                        ];
                        assert.deepEqual(JSON.parse(res.body), expectedList);

                        next(null);
                    }
                );
            },
            function finish(err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                done(err);
            }
        );
    });

});
