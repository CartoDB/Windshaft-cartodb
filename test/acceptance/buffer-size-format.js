require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');
var IMAGE_TOLERANCE_PER_MIL = 20;
var mapnik = require('windshaft').mapnik;

function createMapConfig (bufferSize) {
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
                cartocss: [
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
                ].join('\n'),
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            } 
        }]
    };
}

describe('buffer size per format', function () {
    var testCases = [
        {
            desc: 'should get png tile using buffer-size 1',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-1.png',
            mapConfig: createMapConfig({ png: 1, 'grid.json': 1 }),
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
            desc: 'should get mvt tile using buffer-size 1',
            coords: { z: 7, x: 64, y: 48 },
            format: 'mvt',
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-1.png',
            mapConfig: createMapConfig({ mvt: 1 }),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;
                assert.equal(features.length, 1);

                var map = new mapnik.Map(256, 256);
                tile.render(map, new mapnik.Image(256, 256), function (err, image) {
                    assert.ifError(err);
                    assert.imageIsSimilarToFile(image, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
                }.bind(this));
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
                var features = tileJSON[0].features
                assert.equal(features.length, 9);

                var map = new mapnik.Map(256, 256);
                tile.render(map, new mapnik.Image(256, 256), function (err, image) {
                    assert.ifError(err);
                    assert.imageIsSimilarToFile(image, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
                }.bind(this));
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
                test.assert(tile, function () {
                    testClient.drain(done);
                });
            });
        });
    });
});