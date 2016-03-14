'use strict';

var qs = require('querystring');
var step = require('step');

var mapnik = require('windshaft').mapnik;

var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var assert = require('./assert');
var helper = require('./test_helper');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);


function TestClient(mapConfig, apiKey) {
    this.mapConfig = mapConfig;
    this.apiKey = apiKey;
    this.keysToDelete = {};
}

module.exports = TestClient;

TestClient.prototype.getWidget = function(widgetName, params, callback) {
    var self = this;

    if (!callback) {
        callback = params;
        params = {};
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
                    data: JSON.stringify(self.mapConfig)
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

            var urlParams = {
                own_filter: params.hasOwnProperty('own_filter') ? params.own_filter : 1
            };
            if (params && params.bbox) {
                urlParams.bbox = params.bbox;
            }
            url = '/api/v1/map/' + layergroupId + '/0/widget/' + widgetName + '?' + qs.stringify(urlParams);

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
            self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
            self.keysToDelete['user:localhost:mapviews:global'] = 5;
            return callback(err, res);
        }
    );
};

TestClient.prototype.getTile = function(z, x, y, params, callback) {
    var self = this;

    if (!callback) {
        callback = params;
        params = {};
    }

    var url = '/api/v1/map';

    if (this.apiKey) {
        url += '?' + qs.stringify({api_key: this.apiKey});
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
                    data: JSON.stringify(self.mapConfig)
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
        function getTileResult(err, _layergroupId) {
            assert.ifError(err);

            var next = this;
            layergroupId = _layergroupId;

            url = '/api/v1/map/' + layergroupId + '/';

            var layers = params.layers;

            if (layers !== undefined) {
                layers = Array.isArray(layers) ? layers : [layers];
                url += layers.join(',') + '/';
            }

            var format = params.format || 'png';

            url += [z,x,y].join('/');
            url += '.' + format;

            if (self.apiKey) {
                url += '?' + qs.stringify({api_key: self.apiKey});
            }

            var request = {
                url: url,
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            };

            var expectedResponse = {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            var isPng = format === 'png' || format === 'torque.png';

            if (isPng) {
                request.encoding = 'binary';
                expectedResponse.headers['Content-Type'] = 'image/png';
            }

            assert.response(server, request, expectedResponse, function(res, err) {
                assert.ifError(err);

                var image;

                if (isPng) {
                    image = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                }

                next(null, res, image);
            });
        },
        function finish(err, res, image) {
            self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
            self.keysToDelete['user:localhost:mapviews:global'] = 5;
            return callback(err, res, image);
        }
    );
};

TestClient.prototype.drain = function(callback) {
    helper.deleteRedisKeys(this.keysToDelete, callback);
};
