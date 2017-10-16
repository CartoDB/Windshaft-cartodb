require('../support/test_helper');

var fs = require('fs');
var assert = require('../support/assert');
var TestClient = require('../support/test-client');
var serverOptions = require('../../lib/cartodb/server_options');
var mapnik = require('windshaft').mapnik;
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
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.mvt',
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
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.mvt',
            mapConfig: createMapConfig({ mvt: 128 }),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;
                assert.equal(features.length, 9);
                callback();
            }
        },
        {
            desc: 'should get grid.json tile using buffer-size 0 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            fixturePath: './test/fixtures/buffer-size/tile-grid.json.7.64.48-buffer-size-0.grid.json',
            mapConfig: createMapConfig({ 'grid.json': 0 }),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2,callback);
            }
        },
        {
            desc: 'should get grid.json tile using buffer-size 128 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.grid.json',
            mapConfig: createMapConfig({ 'grid.json': 128 }),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2, callback);
            }
        }
    ];

    afterEach(function(done) {
        if (this.testClient) {
            return this.testClient.drain(done);
        }
        return done();
    });

    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;
    testCases.forEach(function (test) {
        var testFn = (usePostGIS) => {
            it(test.desc, function (done) {
                serverOptions.renderer.mvt.usePostGIS = usePostGIS;
                this.testClient = new TestClient(test.mapConfig, 1234);
                serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
                var coords = test.coords;
                var options = {
                    format: test.format,
                    layers: test.layers
                };
                this.testClient.getTile(coords.z, coords.x, coords.y, options, function (err, res, tile) {
                    assert.ifError(err);
                    // To generate images use:
                    // tile.save(test.fixturePath);
                    test.assert(tile, done);
                });
            });
        };
        if (process.env.POSTGIS_VERSION === '2.4' && test.format === 'mvt'){
            testFn(true);
        }
        testFn(false);
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
            template: createBufferSizeTemplate('named-default-buffer-size', {png: '<%= buffersize %>'}),
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
            template: createBufferSizeTemplate('named-custom-buffer-size', { png: '<%= buffersize %>'}),
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
        },
        {
            desc: 'should get grid.json tile using buffer-size 0 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            placeholders: { buffersize_gridjson: 0 },
            fixturePath: './test/fixtures/buffer-size/tile-grid.json.7.64.48-buffer-size-0.grid.json',
            template: createBufferSizeTemplate('named-default-buffer-size-by-format-gridjson', {
                'grid.json': '<%= buffersize_gridjson %>'
            }, {
                "buffersize_gridjson": {
                    "type": "number",
                    "default": "0"
                }
            }),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2,callback);
            }
        },
        {
            desc: 'should get grid.json tile using buffer-size 128 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            placeholders: { buffersize_gridjson: 128 },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.grid.json',
            template: createBufferSizeTemplate('named-custom-buffer-size-by-format-gridjson', {
                'grid.json': '<%= buffersize_gridjson %>'
            }, {
                "buffersize_gridjson": {
                    "type": "number",
                    "default": "0"
                }
            }),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2, callback);
            }
        }
    ];

    afterEach(function(done) {
        if (this.testClient) {
            return this.testClient.drain(done);
        }
        return done();
    });

    testCases.forEach(function (test) {
        it(test.desc, function (done) {
            this.testClient = new TestClient(test.template, 1234);
            var coords = test.coords;
            var options = {
                format: test.format,
                placeholders: test.placeholders,
                layers: test.layers
            };
            this.testClient.getTile(coords.z, coords.x, coords.y, options, function (err, res, tile) {
                assert.ifError(err);
                // To generate images use:
                //tile.save('./test/fixtures/buffer-size/tile-7.64.48-buffer-size-0-test.png');
                test.assert(tile, done);
            });
        });
    });
});


describe('buffer size per format for named maps w/o placeholders', function () {
    var testCases = [
        {
            desc: 'should get png tile using buffer-size 0 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: {
                buffersize: {
                    png: 0
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            template: createBufferSizeTemplate('named-no-buffer-size-png-0', {}, {}),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 128 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: {
                buffersize: {
                    png: 128
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.png',
            template: createBufferSizeTemplate('named-no-buffer-size-png-128', {}, {}),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },
        {
            desc: 'should get mvt tile using buffer-size 0 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'mvt',
            placeholders: {
                buffersize: {
                    mvt: 0
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-mvt-7.64.48-buffer-size-0.mvt',
            template: createBufferSizeTemplate('named-no-buffer-size-mvt', {}, {}),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;

                var dataFixture = fs.readFileSync(this.fixturePath);
                var vtile = new mapnik.VectorTile(this.coords.z, this.coords.x, this.coords.y);
                vtile.setDataSync(dataFixture);
                var vtileJSON = vtile.toJSON();
                var vtileFeatures = vtileJSON[0].features;

                assert.equal(features.length, vtileFeatures.length);
                callback();
            }
        },
        {
            desc: 'should get mvt tile using buffer-size 128 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'mvt',
            placeholders: {
                buffersize: {
                    mvt: 128
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-mvt-7.64.48-buffer-size-128.mvt',
            template: createBufferSizeTemplate('named-no-buffer-size-mvt-128', {}, {}),
            assert: function (tile, callback) {
                var tileJSON = tile.toJSON();
                var features = tileJSON[0].features;

                var dataFixture = fs.readFileSync(this.fixturePath);
                var vtile = new mapnik.VectorTile(this.coords.z, this.coords.x, this.coords.y);
                vtile.setDataSync(dataFixture);
                var vtileJSON = vtile.toJSON();
                var vtileFeatures = vtileJSON[0].features;

                assert.equal(features.length, vtileFeatures.length);
                callback();
            }
        },
        {
            desc: 'should get grid.json tile using buffer-size 0 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            placeholders: {
                buffersize: {
                    'grid.json': 0
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-grid.json.7.64.48-buffer-size-0.grid.json',
            template: createBufferSizeTemplate('named-no-buffer-size-grid-json-0', {}, {}),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2,callback);
            }
        },
        {
            desc: 'should get grid.json tile using buffer-size 128 overriden by template params',
            coords: { z: 7, x: 64, y: 48 },
            format: 'grid.json',
            layers: [0],
            placeholders: {
                buffersize: {
                    'grid.json': 128
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-128.grid.json',
            template: createBufferSizeTemplate('named-no-buffer-size-grid-json-128', {}, {}),
            assert: function (tile, callback) {
                assert.utfgridEqualsFile(tile, this.fixturePath, 2, callback);
            }
        },
        {
            desc: 'should get png tile using buffer-size 0' +
                  ' overriden by template params with no buffersize in mapconfig',
            coords: { z: 7, x: 64, y: 48 },
            format: 'png',
            placeholders: {
                buffersize: {
                    png: 0
                }
            },
            fixturePath: './test/fixtures/buffer-size/tile-7.64.48-buffer-size-0.png',
            template: createBufferSizeTemplate('named-no-buffer-size-mapconfig-png-0', undefined, {}),
            assert: function (tile, callback) {
                assert.imageIsSimilarToFile(tile, this.fixturePath, IMAGE_TOLERANCE_PER_MIL, callback);
            }
        },

    ];

    afterEach(function(done) {
        if (this.testClient) {
            return this.testClient.drain(done);
        }
        return done();
    });

    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;
    testCases.forEach(function (test) {
        var testFn = (usePostGIS) => {
                it(test.desc + `(${usePostGIS? 'PostGIS':'mapnik'})`, function (done) {
                    serverOptions.renderer.mvt.usePostGIS = usePostGIS;
                    test.template.name += '_1';
                    this.testClient = new TestClient(test.template, 1234);
                    serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
                    var coords = test.coords;
                    var options = {
                        format: test.format,
                        placeholders: test.placeholders,
                        layers: test.layers
                    };
                    this.testClient.getTile(coords.z, coords.x, coords.y, options, function (err, res, tile) {
                        assert.ifError(err);
                        // To generate images use:
                        //tile.save(test.fixturePath);
                        // require('fs').writeFileSync(test.fixturePath, JSON.stringify(tile));
                        // require('fs').writeFileSync(test.fixturePath, tile.getDataSync());
                        test.assert(tile, done);
                    });
                });
        };
        if (process.env.POSTGIS_VERSION === '2.4' && test.format === 'mvt'){
            testFn(true);
        }
        testFn(false);
    });
});
