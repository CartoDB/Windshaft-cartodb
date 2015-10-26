var assert      = require('../support/assert');
var step        = require('step');

var helper = require(__dirname + '/../support/test_helper');
var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);


describe('histograms', function() {

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        helper.deleteRedisKeys(keysToDelete, done);
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
                        cartocss_version: '2.3.0'
                    },
                    widgets: {
                        pop_max: {
                            type: 'histogram',
                            options: {
                                column: 'pop_max'
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
                        return next(null, JSON.parse(res.body).layergroupid);
                    }
                );
            },
            function getHistogram(err, _layergroupId) {
                assert.ifError(err);

                var next = this;
                layergroupId = _layergroupId;

                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/0/histogram/pop_max',
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

                        console.log(JSON.parse(res.body));

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
