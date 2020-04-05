'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
const mapnik = require('@carto/mapnik');
var cartodbServer = require('../../../lib/server');
var ServerOptions = require('./support/ported-server-options');

var LayergroupToken = require('../../../lib/models/layergroup-token');

describe('retina support', function () {
    var layergroupId = null;

    var server;

    before(function () {
        server = cartodbServer(ServerOptions);
        server.setMaxListeners(0);
    });

    var keysToDelete;
    beforeEach(function (done) {
        keysToDelete = { 'user:localhost:mapviews:global': 5 };

        var retinaSampleMapConfig = {
            version: '1.2.0',
            layers: [
                {
                    options: {
                        sql: 'SELECT * FROM populated_places_simple_reduced',
                        cartocss: '#layer { marker-fill:red; } #layer { marker-width: 2; }',
                        cartocss_version: '2.3.0',
                        geom_column: 'the_geom'
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
                data: JSON.stringify(retinaSampleMapConfig)
            },
            {

            },
            function (res, err) {
                assert.ok(!err, 'Failed to create layergroup');

                layergroupId = JSON.parse(res.body).layergroupid;

                done();
            }
        );
    });

    afterEach(function (done) {
        keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    function testRetinaImage (scaleFactor, responseHead, assertFn) {
        assert.response(server,
            {
                url: '/api/v1/map/' + layergroupId + '/0/0/0' + scaleFactor + '.png',
                method: 'GET',
                encoding: 'binary',
                headers: {
                    host: 'localhost'
                }
            },
            responseHead,
            assertFn
        );
    }

    function testValidImageDimmensions (scaleFactor, imageSize, done) {
        testRetinaImage(scaleFactor,
            {
                status: 200,
                headers: {
                    'Content-Type': 'image/png'
                }
            },
            function (res, err) {
                assert.ok(!err, 'Failed to request 0/0/0' + scaleFactor + '.png tile');

                var image = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                assert.strictEqual(image.width(), imageSize);
                assert.strictEqual(image.height(), imageSize);
                done();
            }
        );
    }

    it('image dimensions when scale factor is not defined', function (done) {
        testValidImageDimmensions('', 256, done);
    });

    it('image dimensions when scale factor = @1x', function (done) {
        testValidImageDimmensions('@1x', 256, done);
    });

    it('image dimensions when scale factor = @2x', function (done) {
        testValidImageDimmensions('@2x', 512, done);
    });

    it('error when scale factor is not enabled', function (done) {
        var scaleFactor = '@4x';

        testRetinaImage(scaleFactor,
            {
                status: 404,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            },
            function (res, err) {
                assert.ok(!err, 'Failed to request 0/0/0' + scaleFactor + '.png tile');
                assert.deepStrictEqual(JSON.parse(res.body).errors, ['Tile with specified resolution not found']);

                done();
            }
        );
    });
});
