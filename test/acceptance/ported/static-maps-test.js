'use strict';

require('../../support/test-helper');

var assert = require('../../support/assert');
var testClient = require('./support/test-client');
var http = require('http');
var fs = require('fs');
var path = require('path');

describe('static_maps', function () {
    var validUrlTemplate = 'http://127.0.0.1:8033/{s}/{z}/{x}/{y}.png';
    var invalidUrlTemplate = 'http://127.0.0.1:8033/INVALID/{z}/{x}/{y}.png';

    var httpRendererResourcesServer;

    before(function (done) {
        // Start a server to test external resources
        httpRendererResourcesServer = http.createServer(function (request, response) {
            var filename = path.join(__dirname, '/../../fixtures/http/basemap.png');
            fs.readFile(filename, { encoding: 'binary' }, function (err, file) {
                response.writeHead(200);
                response.write(file, 'binary');
                response.end();
            });
        });
        httpRendererResourcesServer.listen(8033, done);
    });

    after(function (done) {
        httpRendererResourcesServer.close(done);
    });

    function staticMapConfig (urlTemplate, cartocss) {
        return {
            version: '1.2.0',
            layers: [
                {
                    type: 'http',
                    options: {
                        urlTemplate: urlTemplate,
                        subdomains: ['abcd']
                    }
                },
                {
                    type: 'mapnik',
                    options: {
                        sql: 'SELECT * FROM populated_places_simple_reduced',
                        cartocss: cartocss || '#layer { marker-fill:red; } #layer { marker-width: 2; }',
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
    }

    var zoom = 3;
    var lat = 0;
    var lon = 0;
    var width = 400;
    var height = 300;

    it('center image', function (done) {
        var mapConfig = staticMapConfig(validUrlTemplate);
        testClient.getStaticCenter(mapConfig, zoom, lat, lon, width, height, function (err, res, image) {
            if (err) {
                return done(err);
            }

            assert.strictEqual(image.width(), width);
            assert.strictEqual(image.height(), height);

            done();
        });
    });

    it('center image with invalid basemap', function (done) {
        var mapConfig = staticMapConfig(invalidUrlTemplate);
        testClient.getStaticCenter(mapConfig, zoom, lat, lon, width, height, function (err, res, image) {
            if (err) {
                return done(err);
            }

            assert.strictEqual(image.width(), width);
            assert.strictEqual(image.height(), height);

            done();
        });
    });

    var west = -90;
    var south = -45;
    var east = 90;
    var north = 45;
    var bbWidth = 640;
    var bbHeight = 480;

    it('bbox', function (done) {
        var mapConfig = staticMapConfig(validUrlTemplate);
        testClient.getStaticBbox(mapConfig, west, south, east, north, bbWidth, bbHeight, function (err, res, image) {
            if (err) {
                return done(err);
            }

            assert.strictEqual(image.width(), bbWidth);
            assert.strictEqual(image.height(), bbHeight);

            done();
        });
    });

    it('should not fail for coordinates out of range', function (done) {
        var outOfRangeHeight = 3000;
        var mapConfig = staticMapConfig(validUrlTemplate);
        testClient.getStaticCenter(mapConfig, 1, lat, lon, width, outOfRangeHeight, function (err, res, image) {
            if (err) {
                return done(err);
            }

            assert.strictEqual(image.width(), width);
            assert.strictEqual(image.height(), outOfRangeHeight);

            done();
        });
    });

    it('should keep failing for other errors', function (done) {
        var invalidStyleForZoom = '#layer { marker-fill:red; } #layer[zoom=' + zoom + '] { marker-width: [wadus] * 2; }';
        var mapConfig = staticMapConfig(validUrlTemplate, invalidStyleForZoom);
        var expectedResponse = {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
        testClient.getStaticCenter(mapConfig, zoom, lat, lon, width, height, expectedResponse, function (err, res) {
            assert.ok(!err);
            var parsedBody = JSON.parse(res.body);
            assert.ok(parsedBody.errors);
            assert.ok(parsedBody.errors.length);
            assert.ok(parsedBody.errors[0].match(/column \"wadus\" does not exist/));
            done();
        });
    });
});
