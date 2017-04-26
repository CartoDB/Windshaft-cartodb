require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');
var IMAGE_TOLERANCE_PER_MIL = 5;

var CARTOCSS_LABELS = [
    '#layer {',
    '  polygon-fill: #374C70;',
    '  polygon-opacity: 0.9;',
    '  line-width: 1;',
    '  line-color: #FFF;',
    '  line-opacity: 0.5;',
    '}',
    '#layer::labels {',
    '  text-name: [name];',
    '  text-face-name: \'DejaVu Sans Book\';',
    '  text-size: 20;',
    '  text-fill: #FFFFFF;',
    '  text-label-position-tolerance: 0;',
    '  text-halo-radius: 1;',
    '  text-halo-fill: #6F808D;',
    '  text-dy: -10;',
    '  text-allow-overlap: true;',
    '  text-placement: point;',
    '  text-placement-type: dummy;',
    '}'
].join('\n');

function createMapConfig (bufferSize, cartocss) {
    cartocss = cartocss || CARTOCSS_LABELS;

    return {
        version: '1.6.0',
        buffersize: bufferSize,
        layers: [{
            type: "cartodb",
            options: {
                sql: [
                    'select',
                    '   *',
                    'from',
                    '   populated_places_simple_reduced',
                ].join('\n'),
                cartocss: cartocss,
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            }
        }]
    };
}

describe('buffer size per format', function () {
    var testCases = [
        {
            desc: 'should get png tile using buffer-size 0',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            mapConfig: createMapConfig({ png: 0, 'grid.json': 0 }),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 128',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.png',
            mapConfig: createMapConfig({ png: 128, 'grid.json': 128 }),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get mvt tile using buffer-size 0',
            coords: { z: 7, x: 64, y: 48 },
            format: 'mvt',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            mapConfig: createMapConfig({ mvt: 0 }),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;
                assert.equal(features.length, 1);
                callback();
            }
        },
        {
            desc: 'should get mvt tile using buffer-size 128',
            coords: { z: 7, x: 64, y: 48 },
            format: 'mvt',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.png',
            mapConfig: createMapConfig({ mvt: 128 }),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;
                assert.equal(features.length, 9);
                callback();
            }
        }
    ];

    testCases.forEach(function (test) {
        it(test.desc, function (done) {
            var testClient = new TestClient(test.mapConfig, 1234);
            var coords = test.coords;
            testClient.getTile(coords.z, coords.x, coords.y, { format: test.format }, function (err, res, tile) {
                assert.ifError(err);
                // To generate images use:
                // tile.save(test.fixturePath);
                test.assert(tile, function (err) {
                    assert.ifError(err);
                    testClient.drain(done);
                });
            });
        });
    });
});

function createBufferSizeTemplate (name, buffersize, placeholders, cartocss) {
    cartocss = cartocss || CARTOCSS_LABELS;

    return {
        "version": "0.0.1",
        "name": name,
        "placeholders": placeholders || {
            "buffersize": {
                "type": "number",
                "default": 0
            }
        },
        "layergroup": createMapConfig(buffersize)
    };
}

describe('buffer size per format for named maps', function () {
    var testCases = [
        {
            desc: 'should get png tile using buffer-size 0 (default value in template)',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            template: createBufferSizeTemplate('named-default-buffer-size', '<%= buffersize %>'),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 128 (placehoder value)',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: { buffersize: 128 },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.png',
            template: createBufferSizeTemplate('named-custom-buffer-size', '<%= buffersize %>'),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 0 (default value in template by format)',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: { buffersize_png: 0 },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            template: createBufferSizeTemplate('named-default-buffer-size-by-format', {
                png: '<%= buffersize_png %>'
            }, {
                "buffersize_png": {
                    "type": "number",
                    "default": "0"
                }
            }),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 128 (placehoder value in template by format)',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: { buffersize_png: 128 },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.png',
            template: createBufferSizeTemplate('named-custom-buffer-size-by-format', {
                png: '<%= buffersize_png %>'
            }, {
                "buffersize_png": {
                    "type": "number",
                    "default": "0"
                }
            }),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        }
    ];

    testCases.forEach(function (test) {
        it(test.desc, function (done) {
            var testClient = new TestClient(test.template, 1234);
            var coords = test.coords;
            var options = {
                format: test.format,
                placeholders: test.placeholders
            };
            testClient.getTile(coords.z, coords.x, coords.y, options, function (err, res, tile) {
                assert.ifError(err);
                // To generate images use:
                //tile.save('./test/fixtures/buffer-size/tile-7.64.48-buffer-size-0-test.png');
                test.assert(tile, function (err) {
                    assert.ifError(err);
                    testClient.drain(done);
                });
            });
        });
    });
});
