'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var step = require('step');
var cartodbServer = require('../../../lib/server');
var ServerOptions = require('./support/ported-server-options');
var LayergroupToken = require('../../../lib/models/layergroup-token');

describe('raster', function () {
    var server;

    before(function () {
        server = cartodbServer(ServerOptions);
        server.setMaxListeners(0);
    });

    function checkCORSHeaders (res) {
        assert.strictEqual(
            res.headers['access-control-allow-headers'],
            'X-Requested-With, X-Prototype-Version, X-CSRF-Token, Authorization, ' +
            'Carto-Event, Carto-Event-Source, Carto-Event-Group-Id'
        );
        assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    }

    var IMAGE_EQUALS_TOLERANCE_PER_MIL = 2;

    it('can render raster for valid mapconfig', function (done) {
        var mapconfig = {
            version: '1.2.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select ST_AsRaster(' +
                    ' ST_MakeEnvelope(-100,-40, 100, 40, 4326), ' +
                    " 1.0, -1.0, '8BUI', 127) as rst",
                        geom_column: 'rst',
                        geom_type: 'raster',
                        cartocss: '#layer { raster-opacity:1.0 }',
                        cartocss_version: '2.0.1'
                    }
                }
            ]
        };
        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(mapconfig)
                }, {}, function (res, err) { next(err, res); });
            },
            function checkPost (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
                // CORS headers should be sent with response
                // from layergroup creation via POST
                checkCORSHeaders(res);
                var parsedBody = JSON.parse(res.body);
                if (expectedToken) {
                    assert.deepStrictEqual(parsedBody, { layergroupid: expectedToken, layercount: 2 });
                } else {
                    expectedToken = parsedBody.layergroupid;
                }
                return null;
            },
            function doGetTile (err) {
                assert.ifError(err);
                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/' + expectedToken + '/0/0/0.png',
                    method: 'GET',
                    encoding: 'binary',
                    headers: { host: 'localhost' }
                }, {}, function (res, err) { next(err, res); });
            },
            function checkResponse (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 200, res.body);
                assert.deepStrictEqual(res.headers['content-type'], 'image/png');
                var next = this;
                assert.imageBufferIsSimilarToFile(res.body,
                    './test/fixtures/raster_gray_rect.png',
                    IMAGE_EQUALS_TOLERANCE_PER_MIL, function (err) {
                        try {
                            assert.ifError(err);
                            next();
                        } catch (err) { next(err); }
                    });
            },
            function finish (err) {
                if (err) {
                    return done(err);
                }

                var keysToDelete = {
                    'user:localhost:mapviews:global': 5
                };
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                testHelper.deleteRedisKeys(keysToDelete, done);
            }
        );
    });

    it('raster geom type does not allow interactivity', function (done) {
        var mapconfig = {
            version: '1.2.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: [
                            'select 1 id,',
                            "ST_AsRaster(ST_MakeEnvelope(-100, -40, 100, 40, 4326), 1.0, -1.0, '8BUI', 127) as rst"
                        ].join(' '),
                        geom_column: 'rst',
                        geom_type: 'raster',
                        cartocss: '#layer { raster-opacity: 1.0 }',
                        cartocss_version: '2.0.1',
                        interactivity: 'id'
                    }
                }
            ]
        };

        assert.response(server,
            {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(mapconfig)
            },
            {
                status: 400
            },
            function (res, err) {
                assert.ok(!err);
                checkCORSHeaders(res);
                var parsedBody = JSON.parse(res.body);
                assert.deepStrictEqual(parsedBody.errors, ['Mapnik raster layers do not support interactivity']);
                done();
            }
        );
    });
});
