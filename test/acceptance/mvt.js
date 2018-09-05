require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');
var serverOptions = require('../../lib/cartodb/server_options');

function createMapConfig(sql = TestClient.SQL.ONE_POINT) {
    return {
        version: '1.6.0',
        layers: [{
            type: "cartodb",
            options: {
                sql: sql,
                cartocss: TestClient.CARTOCSS.POINTS,
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            }
        }]
    };
}

describe('mvt (mapnik)', mvt(false));
if (process.env.POSTGIS_VERSION >= '20400') {
    describe('mvt (postgis)', mvt(true));
}

function mvt(usePostGIS) {
return function () {
    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;
    before(function () {
        serverOptions.renderer.mvt.usePostGIS = usePostGIS;
    });
    after(function (){
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    describe('named map tile', function () {
        it('should get default named vector tile', function (done) {
            const apikeyToken = 1234;
            const templateName = `mvt-template-${usePostGIS ? 'postgis' : 'mapnik'}`;
            const template = {
                version: '0.0.1',
                name: templateName,
                placeholders: {
                    buffersize: {
                        type: 'number',
                        default: 0
                    }
                },
                layergroup: {
                    version: '1.7.0',
                    layers: [{
                        type: 'cartodb',
                        options: {
                            sql: 'select * from populated_places_simple_reduced limit 10',
                            cartocss: TestClient.CARTOCSS.POINTS,
                            cartocss_version: '2.3.0',
                        }
                    }]
                }
            };

            const testClient = new TestClient(template, apikeyToken);
            testClient.keysToDelete['map_tpl|localhost'] = 0;

            testClient.getNamedTile(templateName, 0, 0, 0, 'mvt', {}, (err, res, tile) => {
                if (err) {
                    return done(err);
                }

                const tileJSON = tile.toJSON();

                assert.equal(tileJSON[0].features.length, 10);

                testClient.drain(done);
            });
        });
    });

    describe('analysis-layers-dataviews-mvt', function () {

        function createMapConfig(layers, dataviews, analysis) {
            return {
                version: '1.5.0',
                layers: layers,
                dataviews: dataviews || {},
                analyses: analysis || []
            };
        }

        var CARTOCSS = [
            "#points {",
            "  marker-fill-opacity: 1.0;",
            "  marker-line-color: #FFF;",
            "  marker-line-width: 0.5;",
            "  marker-line-opacity: 1.0;",
            "  marker-placement: point;",
            "  marker-type: ellipse;",
            "  marker-width: 8;",
            "  marker-fill: red;",
            "  marker-allow-overlap: true;",
            "}"
        ].join('\n');

        var mapConfig = createMapConfig(
            [
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "2570e105-7b37-40d2-bdf4-1af889598745"
                        },
                        "cartocss": CARTOCSS,
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            {
                pop_max_histogram: {
                    source: {
                        id: '2570e105-7b37-40d2-bdf4-1af889598745'
                    },
                    type: 'histogram',
                    options: {
                        column: 'pop_max'
                    }
                }
            },
            [
                {
                    "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                    "type": "source",
                    "params": {
                        "query": "select * from populated_places_simple_reduced"
                    }
                }
            ]
        );

        it('should get pop_max column from dataview', function (done) {
            var testClient = new TestClient(mapConfig);

            testClient.getTile(0, 0, 0, { format: 'mvt', layers: 0 }, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);

                assert.ok(Array.isArray(geojsonTile.features));
                assert.ok(geojsonTile.features.length > 0);
                var feature = geojsonTile.features[0];
                assert.ok(feature.properties.hasOwnProperty('pop_max'), 'Missing pop_max property');

                testClient.drain(done);
            });
        });

    });


    const testCases = [
        {
            desc: 'should get empty mvt with code 204 (no content)',
            coords: { z: 0, x: 0, y: 0 },
            format: 'mvt',
            response: {
                status: 204,
                headers: {
                    'Content-Type': undefined
                }
            },
            mapConfig: createMapConfig(TestClient.SQL.EMPTY)
        },
        {
            desc: 'should get mvt tile with code 200 (ok)',
            coords: { z: 0, x: 0, y: 0 },
            format: 'mvt',
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-protobuf'
                }
            },
            mapConfig: createMapConfig()
        }
    ];

    testCases.forEach(function (test) {
        it(test.desc, done => {
            var testClient = new TestClient(test.mapConfig);
            const { z, x, y } = test.coords;
            const { format, response } = test;

            testClient.getTile(z, x, y, { format, response }, err => {
                assert.ifError(err);
                testClient.drain(done);
            });
        });
    });
};
}
