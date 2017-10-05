'use strict';

var qs = require('querystring');
var step = require('step');
var urlParser = require('url');
var PSQL = require('cartodb-psql');
var _ = require('underscore');
var mapnik = require('windshaft').mapnik;

var LayergroupToken = require('./layergroup-token');

var assert = require('./assert');
var helper = require('./test_helper');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
serverOptions.analysis.batch.inlineExecution = true;

const MAPNIK_SUPPORTED_FORMATS = {
    'png': true,
    'png32': true,
    'grid.json': true,
    'mvt': true,
    'mvt': true
}

function TestClient(config, apiKey) {
    this.mapConfig = isMapConfig(config) ? config : null;
    this.template = isTemplate(config) ? config : null;
    this.apiKey = apiKey;
    this.keysToDelete = {};
    this.server = new CartodbWindshaft(serverOptions);
}

module.exports = TestClient;

function isMapConfig(config) {
    return config && config.layers;
}

function isTemplate(config) {
    return config && config.layergroup;
}

module.exports.RESPONSE = {
    ERROR: {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    }
};

module.exports.CARTOCSS = {
    POINTS: [
        '#layer{',
        '  marker-placement: point;',
        '  marker-allow-overlap: true;',
        '  marker-line-opacity: 0.2;',
        '  marker-line-width: 0.5;',
        '  marker-opacity: 1;',
        '  marker-width: 5;',
        '  marker-fill: red;',
        '}'
    ].join('\n'),

    LINES: [
        '#lines {',
        '  line-color: black;',
        '  line-width: 1;',
        '  line-opacity: 1;',
        '}'
    ].join('\n'),

    POLYGONS: [
        '#layer {',
        '  polygon-fill: red;',
        '  polygon-opacity: 0.6;',
        '  polygon-opacity: 0.7;',
        '  line-color: #FFF;',
        '  line-width: 0.5;',
        '  line-opacity: 1;',
        '}'
    ].join('\n'),

    TORQUE: [
        'Map {',
        '    -torque-frame-count: 256;',
        '    -torque-animation-duration: 30;',
        '    -torque-time-attribute: "cartodb_id";',
        '    -torque-aggregation-function: "count(1)";',
        '    -torque-resolution: 4;',
        '    -torque-data-aggregation: linear;',
        '}',
        '#layer {',
        '    marker-width: 7;',
        '    marker-fill: #FFB927;',
        '    marker-fill-opacity: 0.9;',
        '    marker-line-width: 1;',
        '    marker-line-color: #FFF;',
        '    marker-line-opacity: 1;',
        '    comp-op: lighter;',
        '}',
        '#layer[frame-offset=1] {',
        '    marker-width: 9;',
        '    marker-fill-opacity: 0.45;',
        '}',
        '#layer[frame-offset=2] {',
        '    marker-width: 11;',
        '    marker-fill-opacity: 0.225;',
        '}'
    ].join('\n')
};

module.exports.SQL = {
    EMPTY: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator',
    ONE_POINT: 'select 1 as cartodb_id, \'SRID=3857;POINT(0 0)\'::geometry the_geom_webmercator'
}

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
            assert.response(self.server,
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
            ['bbox', 'bins', 'start', 'end'].forEach(function(extraParam) {
                if (params.hasOwnProperty(extraParam)) {
                    urlParams[extraParam] = params[extraParam];
                }
            });

            url = '/api/v1/map/' + layergroupId + '/0/widget/' + widgetName + '?' + qs.stringify(urlParams);

            assert.response(self.server,
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

TestClient.prototype.widgetSearch = function(widgetName, userQuery, params, callback) {
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
            assert.response(self.server,
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
        function getWidgetSearchResult(err, _layergroupId) {
            assert.ifError(err);

            var next = this;
            layergroupId = _layergroupId;

            var urlParams = {
                q: userQuery,
                own_filter: params.hasOwnProperty('own_filter') ? params.own_filter : 1
            };
            if (params && params.bbox) {
                urlParams.bbox = params.bbox;
            }
            url = '/api/v1/map/' + layergroupId + '/0/widget/' + widgetName + '/search?' + qs.stringify(urlParams);

            assert.response(self.server,
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
            var searchResult;
            if (!err && res.body) {
                searchResult = JSON.parse(res.body);
            }
            return callback(err, res, searchResult);
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

    var expectedResponse = params.response || {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    var layergroupId;
    step(
        function createLayergroup() {
            var next = this;
            assert.response(self.server,
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

            ['bbox', 'bins', 'start', 'end', 'aggregation', 'offset'].forEach(function(extraParam) {
                if (params.hasOwnProperty(extraParam)) {
                    urlParams[extraParam] = params[extraParam];
                }
            });

            if (self.apiKey) {
                urlParams.api_key = self.apiKey;
            }
            url = '/api/v1/map/' + layergroupId + '/dataview/' + dataviewName + '?' + qs.stringify(urlParams);

            assert.response(self.server,
                {
                    url: url,
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                },
                expectedResponse,
                function(res, err) {
                    if (err) {
                        return next(err);
                    }

                    next(null, JSON.parse(res.body));
                }
            );
        },
        function finish(err, dataview) {
            if (err) {
                return callback(err);
            }

            if (layergroupId) {
                self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
                self.keysToDelete['user:localhost:mapviews:global'] = 5;
            }

            return callback(null, dataview);
        }
    );
};

TestClient.prototype.getFeatureAttributes = function(featureId, layerId, params, callback) {
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

    var expectedResponse = params.response || {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    var layergroupId;
    step(
        function createLayergroup() {
            var next = this;
            assert.response(self.server,
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

                    if (parsedBody.layergroupid) {
                        self.keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                        self.keysToDelete['user:localhost:mapviews:global'] = 5;
                    }

                    return next(null, parsedBody.layergroupid);
                }
            );
        },
        function getFeatureAttributes(err, layergroupId) {
            assert.ifError(err);

            var next = this;

            url = '/api/v1/map/' + layergroupId + '/' + layerId + '/attributes/' + featureId;

            assert.response(self.server,
                {
                    url: url,
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                },
                expectedResponse,
                function(res, err) {
                    if (err) {
                        return next(err);
                    }

                    next(null, JSON.parse(res.body));
                }
            );
        },
        function finish(err, attributes) {
            if (err) {
                return callback(err);
            }

            return callback(null, attributes);
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
    var urlNamed = url + '/named';

    if (this.apiKey) {
        url += '?' + qs.stringify({api_key: this.apiKey});
    }

    var layergroupId;

    if (params.layergroupid) {
        layergroupId = params.layergroupid
    }

    step(
        function createTemplate () {
            var next = this;

            if (!self.template) {
                return next();
            }

            if (!self.apiKey) {
                return next(new Error('apiKey param is mandatory to create a new template'));
            }

            params.placeholders = params.placeholders || {};

            assert.response(self.server,
                {
                    url: urlNamed + '?' + qs.stringify({ api_key: self.apiKey }),
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(self.template)
                },
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                },
                function (res, err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, JSON.parse(res.body).template_id);
                }
            );
        },
        function createLayergroup(err, templateId) {
            var next = this;

            if (layergroupId) {
                return next(null, layergroupId);
            }

            var data = templateId ? params.placeholders : self.mapConfig
            var path  = templateId ?
                urlNamed + '/' + templateId  + '?' + qs.stringify({api_key: self.apiKey}) :
                url;

            assert.response(self.server,
                {
                    url: path,
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(data)
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

            if (layers === undefined && !MAPNIK_SUPPORTED_FORMATS[format]) {
                throw new Error(`Missing layer filter while fetching ${format} tile, review params argument`);
            }

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

            var expectedResponse = Object.assign({}, {
                status: 200,
                headers: {
                    'Content-Type': 'image/png'
                }
            }, params.response);


            var isPng = format.match(/png$/);

            if (isPng) {
                request.encoding = 'binary';
            }

            var isMvt = format.match(/mvt$/);

            if (isMvt) {
                request.encoding = 'binary';
                if (expectedResponse.status === 200) {
                    expectedResponse.headers['Content-Type'] = 'application/x-protobuf';
                }
            }


            var isGeojson = format.match(/geojson$/);

            if (isGeojson) {
                request.encoding = 'utf-8';
                expectedResponse.headers['Content-Type'] = 'application/json; charset=utf-8';
            }

            var isGridJSON = format.match(/grid.json$/);

            if (isGridJSON) {
                request.encoding = 'utf-8';
                expectedResponse.headers['Content-Type'] = 'application/json; charset=utf-8';
            }

            if (params.contentType) {
                expectedResponse.headers['Content-Type'] = 'application/json; charset=utf-8';
            }

            assert.response(self.server, request, expectedResponse, function(res, err) {
                assert.ifError(err);

                var body;
                switch (res.headers['content-type']) {
                    case 'image/png':
                        body = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                        break;
                    case 'application/x-protobuf':
                        body = new mapnik.VectorTile(z, x, y);
                        body.setDataSync(new Buffer(res.body, 'binary'));
                        break;
                    case 'application/json; charset=utf-8':
                        body = JSON.parse(res.body);
                        break;
                    default:
                        body = res.body
                        break;
                }

                next(null, res, body);
            });
        },
        function finish(err, res, image) {
            if (layergroupId) {
                self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
                self.keysToDelete['user:localhost:mapviews:global'] = 5;
            }
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

    assert.response(self.server,
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
            // If there is a response, we are still interested in catching the created keys
            // to be able to delete them on the .drain() method.
            if (res) {
                var parsedBody = JSON.parse(res.body);
                if (parsedBody.layergroupid) {
                    self.keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                    self.keysToDelete['user:localhost:mapviews:global'] = 5;
                }
            }
            if (err) {
                return callback(err);
            }

            return callback(null, parsedBody);
        }
    );
};

TestClient.prototype.getStaticCenter = function (params, callback) {
    var self = this;

    let { layergroupid, z, lat, lng, width, height, format } = params

    var url = `/api/v1/map/`;

    if (this.apiKey) {
        url += '?' + qs.stringify({api_key: this.apiKey});
    }

    step(
        function createLayergroup() {
            var next = this;

            if (layergroupid) {
                return next(null, layergroupid);
            }

            var data = self.mapConfig
            var path  = url;

            assert.response(self.server,
                {
                    url: path,
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(data)
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
        function getStaticResult(err, _layergroupid) {
            assert.ifError(err);

            var next = this;

            layergroupid = _layergroupid;

            url = `/api/v1/map/static/center/${layergroupid}/${z}/${lat}/${lng}/${width}/${height}.${format}`

            if (self.apiKey) {
                url += '?' + qs.stringify({api_key: self.apiKey});
            }

            var request = {
                url: url,
                encoding: 'binary',
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            };

            var expectedResponse = Object.assign({}, {
                status: 200,
                headers: {
                    'Content-Type': 'image/png'
                }
            }, params.response);

            assert.response(self.server, request, expectedResponse, function(res, err) {
                assert.ifError(err);

                var body;
                switch (res.headers['content-type']) {
                    case 'image/png':
                        body = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
                        break;
                    case 'application/json; charset=utf-8':
                        body = JSON.parse(res.body);
                        break;
                    default:
                        body = res.body
                        break;
                }

                next(null, res, body);
            });
        },
        function finish(err, res, image) {
            if (layergroupid) {
                self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupid).token] = 0;
                self.keysToDelete['user:localhost:mapviews:global'] = 5;
            }
            return callback(err, res, image);
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
            assert.response(self.server,
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

            assert.response(self.server, request, expectedResponse, function(res, err) {
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

TestClient.prototype.getAttributes  = function(params, callback) {
    var self = this;

    if (!Number.isFinite(params.featureId)) {
        throw new Error('featureId param must be a number')
    }

    if (!Number.isFinite(params.layer)) {
        throw new Error('layer param must be a number')
    }

    var url = '/api/v1/map';

    if (this.apiKey) {
        url += '?' + qs.stringify({ api_key: this.apiKey });
    }

    var layergroupid;

    if (params.layergroupid) {
        layergroupid = params.layergroupid
    }

    step(
        function createLayergroup() {
            var next = this;

            if (layergroupid) {
                return next(null, layergroupid);
            }

            assert.response(self.server,
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

                    return next(null, parsedBody.layergroupid);
                }
            );
        },
        function getAttributes(err, _layergroupid) {
            assert.ifError(err);

            var next = this;

            layergroupid = _layergroupid;

            url = `/api/v1/map/${layergroupid}/${params.layer}/attributes/${params.featureId}`;

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

            var expectedResponse = params.response || {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            assert.response(self.server, request, expectedResponse, function (res, err) {
                assert.ifError(err);

                var attributes = JSON.parse(res.body);

                next(null, res, attributes);
            });
        },
        function finish(err, res, attributes) {
            if (layergroupid) {
                self.keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupid).token] = 0;
                self.keysToDelete['user:localhost:mapviews:global'] = 5;
            }

            return callback(err, res, attributes);
        }
    );
};

TestClient.prototype.drain = function(callback) {
    helper.deleteRedisKeys(this.keysToDelete, callback);
};

module.exports.getStaticMap = function getStaticMap(templateName, params, callback) {
    var self = this;

    self.server = new CartodbWindshaft(serverOptions);

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

    assert.response(self.server, requestOptions, expectedResponse, function (res, err) {
        helper.deleteRedisKeys({'user:localhost:mapviews:global': 5}, function() {
            return callback(err, mapnik.Image.fromBytes(new Buffer(res.body, 'binary')));
        });
    });
};

TestClient.prototype.setUserRenderTimeoutLimit = function (user, userTimeoutLimit, callback) {
    const userTimeoutLimitsKey = `limits:timeout:${user}`;
    const params = [
        userTimeoutLimitsKey,
        'render', userTimeoutLimit,
        'render_public', userTimeoutLimit
    ];

    this.keysToDelete[userTimeoutLimitsKey] = 5;

    helper.configureMetadata('hmset', params, callback);
};

TestClient.prototype.setUserDatabaseTimeoutLimit = function (timeoutLimit, callback) {
    const dbname = _.template(global.environment.postgres_auth_user, { user_id: 1 }) + '_db';
    const dbuser = _.template(global.environment.postgres_auth_user, { user_id: 1 })
    const pass = _.template(global.environment.postgres_auth_pass, { user_id: 1 })
    const publicuser = global.environment.postgres.user;

    // we need to guarantee all new connections have the new settings
    helper.cleanPGPoolConnections()

    const psql = new PSQL({
        user: 'postgres',
        dbname: dbname,
        host: global.environment.postgres.host,
        port: global.environment.postgres.port
    });

    step(
        function configureTimeouts () {
            const timeoutSQLs = [
                `ALTER ROLE "${publicuser}" SET STATEMENT_TIMEOUT TO ${timeoutLimit}`,
                `ALTER ROLE "${dbuser}" SET STATEMENT_TIMEOUT TO ${timeoutLimit}`,
                `ALTER DATABASE "${dbname}" SET STATEMENT_TIMEOUT TO ${timeoutLimit}`
            ];

            const group = this.group();

            timeoutSQLs.forEach(sql => psql.query(sql, group()));
        },
        callback
    );
};


