'use strict';

var qs = require('querystring');
var step = require('step');
var urlParser = require('url');

var mapnik = require('windshaft').mapnik;

var LayergroupToken = require('./layergroup-token');

var assert = require('./assert');
var helper = require('./test_helper');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
serverOptions.analysis.batch.inlineExecution = true;
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

                    var expectedDataviewsURLS = {
                        http: "/api/v1/map/" + parsedBody.layergroupid + "/dataview/" + widgetName
                    };
                    assert.ok(parsedBody.metadata.dataviews[widgetName]);
                    assert.ok(
                        parsedBody.metadata.dataviews[widgetName].url.http.match(expectedDataviewsURLS.http)
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
            var widget;
            if (!err && res.body) {
                widget = JSON.parse(res.body);
            }
            return callback(err, res, widget);
        }
    );
};

TestClient.prototype.getDataview = function(dataviewName, params, callback) {
    var self = this;

    if (!callback) {
        callback = params;
        params = {};
    }

    var extraParams = {};
    if (this.apiKey) {
        extraParams.api_key = this.apiKey;
    }
    if (params && params.filters) {
        extraParams.filters = JSON.stringify(params.filters);
    }

    var url = '/api/v1/map';
    if (Object.keys(extraParams).length > 0) {
        url += '?' + qs.stringify(extraParams);
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
                    var expectedDataviewsURLS = {
                        http: "/api/v1/map/" + parsedBody.layergroupid + "/dataview/" + dataviewName
                    };
                    assert.ok(parsedBody.metadata.dataviews[dataviewName]);
                    assert.ok(
                        parsedBody.metadata.dataviews[dataviewName].url.http.match(expectedDataviewsURLS.http)
                    );
                    return next(null, parsedBody.layergroupid);
                }
            );
        },
        function getDataviewResult(err, _layergroupId) {
            assert.ifError(err);

            var next = this;
            layergroupId = _layergroupId;

            var urlParams = {
                own_filter: params.hasOwnProperty('own_filter') ? params.own_filter : 1
            };
            if (params && params.bbox) {
                urlParams.bbox = params.bbox;
            }
            if (self.apiKey) {
                urlParams.api_key = self.apiKey;
            }
            url = '/api/v1/map/' + layergroupId + '/dataview/' + dataviewName + '?' + qs.stringify(urlParams);

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

                    next(null, JSON.parse(res.body));
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

            var isPng = format.match(/png$/);

            if (isPng) {
                request.encoding = 'binary';
                expectedResponse.headers['Content-Type'] = 'image/png';
            }

            assert.response(server, request, expectedResponse, function(res, err) {
                assert.ifError(err);

                var obj;

                if (isPng) {
                    obj = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                } else {
                    obj = JSON.parse(res.body);
                }

                next(null, res, obj);
            });
        },
        function finish(err, res, image) {
            self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
            self.keysToDelete['user:localhost:mapviews:global'] = 5;
            return callback(err, res, image);
        }
    );
};

TestClient.prototype.getLayergroup = function(expectedResponse, callback) {
    var self = this;

    if (!callback) {
        callback = expectedResponse;
        expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
    }

    var url = '/api/v1/map';

    if (this.apiKey) {
        url += '?' + qs.stringify({api_key: this.apiKey});
    }

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
        expectedResponse,
        function(res, err) {
            if (err) {
                return callback(err);
            }

            var parsedBody = JSON.parse(res.body);

            if (parsedBody.layergroupid) {
                self.keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                self.keysToDelete['user:localhost:mapviews:global'] = 5;
            }

            return callback(null, parsedBody);
        }
    );
};

TestClient.prototype.getNodeStatus = function(nodeName, callback) {
    var self = this;

    var url = '/api/v1/map';

    if (this.apiKey) {
        url += '?' + qs.stringify({api_key: this.apiKey});
    }

    var layergroupId;
    var nodes = {};
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

                    nodes = parsedBody.metadata.analyses.reduce(function(nodes, analysis) {
                        return Object.keys(analysis.nodes).reduce(function(nodes, nodeName) {
                            var node = analysis.nodes[nodeName];
                            nodes[nodeName] = node.url.http;
                            return nodes;
                        }, nodes);
                    }, nodes);

                    return next(null, parsedBody.layergroupid);
                }
            );
        },
        function getNodeStatusResult(err, _layergroupId) {
            assert.ifError(err);

            var next = this;
            layergroupId = _layergroupId;

            url = urlParser.parse(nodes[nodeName]).path;

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

            assert.response(server, request, expectedResponse, function(res, err) {
                assert.ifError(err);
                next(null, res, JSON.parse(res.body));
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

module.exports.getStaticMap = function getStaticMap(templateName, params, callback) {
    if (!callback) {
        callback = params;
        params = null;
    }

    var url = '/api/v1/map/static/named/' + templateName + '/640/480.png';

    if (params !== null) {
        url += '?' + qs.stringify(params);
    }

    var requestOptions = {
        url: url,
        method: 'GET',
        headers: {
            host: 'localhost'
        },
        encoding: 'binary'
    };

    var expectedResponse = {
        status: 200,
        headers: {
            'Content-Type': 'image/png'
        }
    };

    // this could be removed once named maps are invalidated, otherwise you hits the cache
    var server = new CartodbWindshaft(serverOptions);

    assert.response(server, requestOptions, expectedResponse, function (res, err) {
        helper.deleteRedisKeys({'user:localhost:mapviews:global': 5}, function() {
            return callback(err, mapnik.Image.fromBytes(new Buffer(res.body, 'binary')));
        });
    });
};
