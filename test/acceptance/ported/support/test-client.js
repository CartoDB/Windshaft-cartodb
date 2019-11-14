'use strict';

var testHelper = require('../../../support/test-helper');
var LayergroupToken = require('../../../../lib/models/layergroup-token');

var step = require('step');
var assert = require('../../../support/assert');
var _ = require('underscore');
var querystring = require('querystring');
var mapnik = require('windshaft').mapnik;
var CartodbServer = require('../../../../lib/server');
var PortedServerOptions = require('./ported-server-options');

var DEFAULT_POINT_STYLE = [
    '#layer {',
    '  marker-fill: #FF6600;',
    '  marker-opacity: 1;',
    '  marker-width: 16;',
    '  marker-line-color: white;',
    '  marker-line-width: 3;',
    '  marker-line-opacity: 0.9;',
    '  marker-placement: point;',
    '  marker-type: ellipse;',
    '  marker-allow-overlap: true;',
    '}'
].join('');

module.exports = {
    createLayergroup: createLayergroup,
    withLayergroup: withLayergroup,

    singleLayerMapConfig: singleLayerMapConfig,
    defaultTableMapConfig: defaultTableMapConfig,

    getStaticBbox: getStaticBbox,
    getStaticCenter: getStaticCenter,
    getGrid: getGrid,
    getGridJsonp: getGridJsonp,
    getTorque: getTorque,
    getTile: getTile,
    getTileLayer: getTileLayer
};

var server;

function getServer () {
    if (server) {
        return server;
    }

    server = new CartodbServer(PortedServerOptions);
    server.setMaxListeners(0);

    return server;
}

var jsonContentType = 'application/json; charset=utf-8';
var jsContentType = 'text/javascript; charset=utf-8';
var pngContentType = 'image/png';

function createLayergroup (layergroupConfig, options, callback) {
    if (!callback) {
        callback = options;
        options = {
            method: 'POST',
            statusCode: 200
        };
    }

    var expectedResponse = {
        status: options.statusCode || 200,
        headers: options.headers || {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    step(
        function requestLayergroup () {
            var next = this;
            var request = layergroupRequest(layergroupConfig, options.method, options.callbackName, options.params);
            assert.response(serverInstance(options), request, expectedResponse, function (res, err) {
                next(err, res);
            });
        },
        function validateLayergroup (err, res) {
            assert.ifError(err);

            var parsedBody;
            var layergroupid;
            if (options.callbackName) {
                global[options.callbackName] = function (layergroup) {
                    layergroupid = layergroup.layergroupid;
                };
                eval(res.body); // eslint-disable-line no-eval
                delete global[options.callbackName];
            } else {
                parsedBody = JSON.parse(res.body);
                layergroupid = parsedBody.layergroupid;
                if (layergroupid) {
                    layergroupid = LayergroupToken.parse(layergroupid).token;
                }
            }

            if (layergroupid) {
                var keysToDelete = {
                    'user:localhost:mapviews:global': 5
                };
                var redisKey = 'map_cfg|' + layergroupid;
                keysToDelete[redisKey] = 0;
                testHelper.deleteRedisKeys(keysToDelete, function () {
                    return callback(err, res, parsedBody);
                });
            } else {
                return callback(err, res, parsedBody);
            }
        }
    );
}

function serverInstance (options) {
    if (options.server) {
        return options.server;
    }

    if (options.serverOptions) {
        var otherServer = new CartodbServer(options.serverOptions);
        otherServer.req2params = options.serverOptions.req2params;
        otherServer.setMaxListeners(0);
        return otherServer;
    }

    return getServer();
}

function layergroupRequest (layergroupConfig, method, callbackName, extraParams) {
    method = method || 'POST';

    var request = {
        url: '/api/v1/map',
        headers: {
            host: 'localhost',
            'Content-Type': 'application/json'
        }
    };

    var urlParams = _.extend({}, extraParams);
    if (callbackName) {
        urlParams.callback = callbackName;
    }

    if (method.toUpperCase() === 'GET') {
        request.method = 'GET';
        urlParams.config = JSON.stringify(layergroupConfig);
    } else {
        request.method = 'POST';
        request.data = JSON.stringify(layergroupConfig);
    }

    if (Object.keys(urlParams).length) {
        request.url += '?' + querystring.stringify(urlParams);
    }

    return request;
}

function singleLayerMapConfig (sql, cartocss, cartocssVersion, interactivity) {
    return {
        version: '1.3.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: sql,
                    cartocss: cartocss || DEFAULT_POINT_STYLE,
                    cartocss_version: cartocssVersion || '2.3.0',
                    interactivity: interactivity,
                    geom_column: 'the_geom'
                }
            }
        ]
    };
}

function defaultTableMapConfig (tableName, cartocss, cartocssVersion, interactivity) {
    return singleLayerMapConfig(defaultTableQuery(tableName), cartocss, cartocssVersion, interactivity);
}

function defaultTableQuery (tableName) {
    return _.template('SELECT * FROM <%= tableName %>', { tableName: tableName });
}

function getStaticBbox (layergroupConfig, west, south, east, north, width, height, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = pngContentType;
    }

    var url = [
        'static',
        'bbox',
        '<%= layergroupid %>',
        [west, south, east, north].join(','),
        width,
        height
    ].join('/') + '.png';
    return getGeneric(layergroupConfig, url, expectedResponse, callback);
}

function getStaticCenter (layergroupConfig, zoom, lat, lon, width, height, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = pngContentType;
    }

    var url = [
        'static',
        'center',
        '<%= layergroupid %>',
        zoom,
        lat,
        lon,
        width,
        height
    ].join('/') + '.png';
    return getGeneric(layergroupConfig, url, expectedResponse, callback);
}

function getGrid (layergroupConfig, layer, z, x, y, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = jsonContentType;
    }

    var options = {
        layer: layer,
        z: z,
        x: x,
        y: y,
        format: 'grid.json'
    };
    return getLayer(layergroupConfig, options, expectedResponse, callback);
}

function getGridJsonp (layergroupConfig, layer, z, x, y, jsonpCallbackName, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = jsContentType;
    }

    var options = {
        layer: layer,
        z: z,
        x: x,
        y: y,
        format: 'grid.json',
        jsonpCallbackName: jsonpCallbackName
    };
    return getLayer(layergroupConfig, options, expectedResponse, callback);
}

function getTorque (layergroupConfig, layer, z, x, y, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = jsonContentType;
    }

    var options = {
        layer: layer,
        z: z,
        x: x,
        y: y,
        format: 'torque.json'
    };
    return getLayer(layergroupConfig, options, expectedResponse, callback);
}

function getTile (layergroupConfig, z, x, y, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = pngContentType;
    }

    var options = {
        z: z,
        x: x,
        y: y,
        format: 'png'
    };
    return getLayer(layergroupConfig, options, expectedResponse, callback);
}

function getTileLayer (layergroupConfig, options, expectedResponse, callback) {
    if (!callback) {
        callback = expectedResponse;
        expectedResponse = pngContentType;
    }

    return getLayer(layergroupConfig, options, expectedResponse, callback);
}

function getLayer (layergroupConfig, options, expectedResponse, callback) {
    return getGeneric(layergroupConfig, tileUrlStrategy(options), expectedResponse, callback);
}

function tileUrlStrategy (options) {
    var urlLayerPattern = [
        '<%= layer %>',
        '<%= z %>',
        '<%= x %>',
        '<%= y %>'
    ].join('/') + '.<%= format %>';

    if (options.jsonpCallbackName) {
        urlLayerPattern += '?callback=<%= jsonpCallbackName %>';
    }

    var urlNoLayerPattern = [
        '<%= z %>',
        '<%= x %>',
        '<%= y %>'
    ].join('/') + '.<%= format %>';

    var urlTemplate = _.template((options.layer === undefined) ? urlNoLayerPattern : urlLayerPattern);

    options.format = options.format || 'png';

    return '<%= layergroupid %>/' + urlTemplate(_.defaults(options, { z: 0, x: 0, y: 0, layer: 0 }));
}

function getGeneric (layergroupConfig, url, expectedResponse, callback) {
    if (_.isString(expectedResponse)) {
        expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': expectedResponse
            }
        };
    }
    var contentType = expectedResponse.headers['Content-Type'];

    var layergroupid = null;

    step(
        function requestLayergroup () {
            var next = this;
            var request = {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(layergroupConfig)
            };
            var expectedResponse = {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };
            assert.response(getServer(), request, expectedResponse, function (res, err) {
                next(err, res);
            });
        },
        function validateLayergroup (err, res) {
            assert.ok(!err, 'Failed to create layergroup');

            var parsedBody = JSON.parse(res.body);
            layergroupid = parsedBody.layergroupid;

            assert.ok(layergroupid);

            return res;
        },
        function requestTile (err, res) {
            assert.ok(!err, 'Invalid layergroup response: ' + res.body);

            var next = this;

            var finalUrl = '/api/v1/map/' + _.template(url, {
                layergroupid: layergroupid
            });

            var request = {
                url: finalUrl,
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            };

            if (contentType === pngContentType) {
                request.encoding = 'binary';
            }

            assert.response(getServer(), request, expectedResponse, function (res, err) {
                next(err, res);
            });
        },
        function validateTile (err, res) {
            assert.ok(!err, 'Failed to get tile');

            var img;
            if (contentType === pngContentType) {
                img = mapnik.Image.fromBytesSync(Buffer.from(res.body, 'binary'));
            }

            var keysToDelete = {
                'user:localhost:mapviews:global': 5
            };
            var redisKey = 'map_cfg|' + LayergroupToken.parse(layergroupid).token;
            keysToDelete[redisKey] = 0;
            testHelper.deleteRedisKeys(keysToDelete, function () {
                return callback(err, res, img);
            });
        }
    );
}

function withLayergroup (layergroupConfig, options, callback) {
    var validationLayergroupFn = function () {};
    if (!callback) {
        callback = options;
        options = {};
    }

    if (_.isFunction(options)) {
        validationLayergroupFn = options;
        options = {};
    }

    var layergroupExpectedResponse = {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    step(
        function requestLayergroup () {
            var next = this;
            var request = layergroupRequest(layergroupConfig, 'POST');
            assert.response(serverInstance(options), request, layergroupExpectedResponse, function (res, err) {
                next(err, res);
            });
        },
        function validateLayergroup (err, res) {
            assert.ok(!err, 'Failed to request layergroup');

            var parsedBody = JSON.parse(res.body);
            var layergroupid = parsedBody.layergroupid;

            assert.ok(layergroupid, 'No layergroup was created');

            validationLayergroupFn(res);

            function requestTile (layergroupUrl, options, callback) {
                if (!callback) {
                    callback = options;
                    options = {
                        statusCode: 200,
                        contentType: pngContentType
                    };
                }

                const signerTpl = function ({ signer }) {
                    return `${signer ? `:${signer}@` : ''}`;
                };

                const cacheTpl = function ({ cacheBuster }) {
                    return `${cacheBuster ? `:${cacheBuster}` : ''}`;
                };

                const urlTpl = function ({ layergroupid, cacheBuster, tile }) {
                    const { signer, token, cacheBuster: cb } = LayergroupToken.parse(layergroupid);
                    const base = '/api/v1/map/';
                    return `${base}${signerTpl({ signer })}${token}${cacheTpl({ cacheBuster: (cacheBuster || cb) })}${tile}`;
                };

                const finalUrl = urlTpl({ layergroupid, cacheBuster: options.cache_buster, tile: layergroupUrl });

                var request = {
                    url: finalUrl,
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    }
                };

                if (options.contentType === pngContentType) {
                    request.encoding = 'binary';
                }

                var tileExpectedResponse = {
                    status: options.statusCode || 200,
                    headers: {
                        'Content-Type': options.contentType || pngContentType
                    }
                };

                assert.response(serverInstance(options), request, tileExpectedResponse, function (res, err) {
                    callback(err, res);
                });
            }

            function finish (done) {
                var keysToDelete = {
                    'user:localhost:mapviews:global': 5
                };
                var redisKey = 'map_cfg|' + LayergroupToken.parse(layergroupid).token;
                keysToDelete[redisKey] = 0;
                testHelper.deleteRedisKeys(keysToDelete, done);
            }

            return callback(err, requestTile, finish);
        }
    );
}
