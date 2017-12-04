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
if (process.env.POSTGIS_VERSION === '2.4') {
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


    if (usePostGIS){
        describe('use only needed columns', onlyNeededColumns);
    }else{
        describe.skip('use only needed columns', onlyNeededColumns);
    }

    function onlyNeededColumns() {
        function getFeatureByCartodbId(features, cartodbId) {
            for (var i = 0, len = features.length; i < len; i++) {
                if (features[i].properties.cartodb_id === cartodbId) {
                    return features[i];
                }
            }
            return {};
        }

        var options = { format: 'mvt', layer: 0 };

        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        it('with aggregation widget, interactivity and cartocss columns', function (done) {
            var widgetMapConfig = {
                version: '1.5.0',
                layers: [{
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss:
                            '#layer0 { marker-fill: red; marker-width: 10; [name="Madrid"] { marker-fill: green; } }',
                        cartocss_version: '2.0.1',
                        widgets: {
                            adm0name: {
                                type: 'aggregation',
                                options: {
                                    column: 'adm0name',
                                    aggregation: 'sum',
                                    aggregationColumn: 'pop_max'
                                }
                            }
                        },
                        interactivity: "cartodb_id,pop_min"
                    }
                }]
            };

            this.testClient = new TestClient(widgetMapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);
                assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                    cartodb_id: 1109,
                    name: 'Mardin',
                    adm0name: 'Turkey',
                    pop_max: 71373,
                    pop_min: 57586
                });
                done();
            });
        });

        it('should not duplicate columns', function (done) {
            var widgetMapConfig = {
                version: '1.5.0',
                layers: [{
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: ['#layer0 {',
                            'marker-fill: red;',
                            'marker-width: 10;',
                            '[name="Madrid"] { marker-fill: green; } ',
                            '[pop_max>100000] { marker-fill: black; } ',
                            '}'].join('\n'),
                        cartocss_version: '2.3.0',
                        widgets: {
                            adm0name: {
                                type: 'aggregation',
                                options: {
                                    column: 'adm0name',
                                    aggregation: 'sum',
                                    aggregationColumn: 'pop_max'
                                }
                            }
                        },
                        interactivity: "cartodb_id,pop_max"
                    }
                }]
            };

            this.testClient = new TestClient(widgetMapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);
                assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                    cartodb_id: 1109,
                    name: 'Mardin',
                    adm0name: 'Turkey',
                    pop_max: 71373
                });
                done();
            });
        });

        it('with formula widget, no interactivity and no cartocss columns', function (done) {
            var formulaWidgetMapConfig = {
                version: '1.5.0',
                layers: [{
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced where pop_max > 0 and pop_max < 600000',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        interactivity: 'cartodb_id',
                        widgets: {
                            pop_max_f: {
                                type: 'formula',
                                options: {
                                    column: 'pop_max',
                                    operation: 'count'
                                }
                            }
                        }
                    }
                }]
            };
            this.testClient = new TestClient(formulaWidgetMapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);
                assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                    cartodb_id: 1109,
                    pop_max: 71373
                });
                done();
            });
        });
        it('with cartocss with multiple expressions', function (done) {
            var formulaWidgetMapConfig = {
                version: '1.5.0',
                layers: [{
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced where pop_max > 0 and pop_max < 600000',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }' +
                        '#layer0 { marker-width: 14; [name="Madrid"] { marker-width: 20; } }' +
                        '#layer0[pop_max>1000] { marker-width: 14; [name="Madrid"] { marker-width: 20; } }' +
                        '#layer0[adm0name=~".*Turkey*"] { marker-width: 14; [name="Madrid"] { marker-width: 20; } }',
                        cartocss_version: '2.0.1',
                        interactivity: 'cartodb_id'
                    }
                }]
            };

            this.testClient = new TestClient(formulaWidgetMapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);
                assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                    cartodb_id: 1109,
                    pop_max: 71373,
                    name: "Mardin",
                    adm0name: "Turkey"
                });
                done();
            });
        });

        var skipOnPostGIS = usePostGIS ? it.skip: it;
        skipOnPostGIS('should work with mapnik substitution tokens', function (done) {
            var cartocss = [
                "#layer {",
                "  line-width: 2;",
                "  line-color: #3B3B58;",
                "  line-opacity: 1;",
                "  polygon-opacity: 0.7;",
                "  polygon-fill: ramp([points_count], (#E5F5F9,#99D8C9,#2CA25F))",
                "}"
            ].join('\n');

            var sql = [
            'WITH hgrid AS (',
            '  SELECT CDB_HexagonGrid(',
            '    ST_Expand(!bbox!, greatest(!pixel_width!,!pixel_height!) * 100),',
            '    greatest(!pixel_width!,!pixel_height!) * 100',
            '  ) as cell',
            ')',
            'SELECT',
            '  hgrid.cell as the_geom_webmercator,',
            '  count(1) as points_count,',
            '  count(1)/power(100 * CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!)), 2) as points_density,',
            '  1 as cartodb_id',
            'FROM hgrid, (SELECT * FROM populated_places_simple_reduced) i',
            'where ST_Intersects(i.the_geom_webmercator, hgrid.cell)',
            'GROUP BY hgrid.cell'
            ].join('\n');

            var mapConfig = {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": 'mapnik',
                        "options": {
                            "cartocss_version": '2.3.0',
                            "sql": sql,
                            "cartocss": cartocss
                        }
                    }
                ]
            };

            this.testClient = new TestClient(mapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);

                assert.ok(geojsonTile);
                assert.equal(geojsonTile.features.length, 5);

                done();
            });
        });

        it('should skip empty and null columns for geojson tiles', function (done) {

            var mapConfig = {
                "analyses": [
                    {
                        "id": "a0",
                        "params": {
                            "query": "SELECT * FROM test_table"
                        },
                        "type": "source"
                    }
                ],
                "dataviews": {
                    "4e7b0e07-6d21-4b83-9adb-6d7e17eea6ca": {
                        "options": {
                            "aggregationColumn": null,
                            "column": "cartodb_id",
                            "operation": "avg"
                        },
                        "source": {
                            "id": "a0"
                        },
                        "type": "formula"
                    },
                    "74f590f8-625c-4e95-922f-34ad3e9919c0": {
                        "options": {
                            "aggregation": "sum",
                            "aggregationColumn": "cartodb_id",
                            "column": "name"
                        },
                        "source": {
                            "id": "a0"
                        },
                        "type": "aggregation"
                    },
                    "98a75757-3006-400a-b028-fb613a6c0b69": {
                        "options": {
                            "aggregationColumn": null,
                            "column": "cartodb_id",
                            "operation": "sum"
                        },
                        "source": {
                            "id": "a0"
                        },
                        "type": "formula"
                    },
                    "ebbc97b2-87d2-4895-9e1f-2f012df3679d": {
                        "options": {
                            "aggregationColumn": null,
                            "bins": "12",
                            "column": "cartodb_id"
                        },
                        "source": {
                            "id": "a0"
                        },
                        "type": "histogram"
                    },
                    "ebc0653f-3581-469c-8b31-c969e440a865": {
                        "options": {
                            "aggregationColumn": null,
                            "column": "cartodb_id",
                            "operation": "avg"
                        },
                        "source": {
                            "id": "a0"
                        },
                        "type": "formula"
                    }
                },
                "layers": [
                    {
                        "options": {
                            "subdomains": "abcd",
                            "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png"
                        },
                        "type": "http"
                    },
                    {
                        "options": {
                            "attributes": {
                                "columns": [
                                    "name",
                                    "address"
                                ],
                                "id": "cartodb_id"
                            },
                            "cartocss": "#layer { marker-width: 10; marker-fill: red; }",
                            "cartocss_version": "2.3.0",
                            "interactivity": "cartodb_id",
                            "layer_name": "wadus",
                            "source": {
                                "id": "a0"
                            }
                        },
                        "type": "cartodb"
                    },
                    {
                        "options": {
                            "subdomains": "abcd",
                            "urlTemplate": "http://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"
                        },
                        "type": "http"
                    }
                ]
            };

            this.testClient = new TestClient(mapConfig);
            this.testClient.getTile(0, 0, 0, options, function (err, res, MVT) {
                var geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                assert.ok(!err, err);

                assert.ok(geojsonTile);
                assert.equal(geojsonTile.features.length, 5);

                assert.deepEqual(Object.keys(geojsonTile.features[0].properties), ['cartodb_id', 'name']);

                done();
            });
        });

    }
};
}
