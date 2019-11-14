'use strict';

require('../../support/test-helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
const serverOptions = require('../../../lib/server-options');

const suites = [
    {
        desc: 'mvt (mapnik)',
        usePostGIS: false
    },
    {
        desc: 'mvt (postgis)',
        usePostGIS: true
    }
];

suites.forEach(({ desc, usePostGIS }) => {
    describe(`[${desc}] Create mapnik layergroup`, function () {
        const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

        before(function () {
            serverOptions.renderer.mvt.usePostGIS = usePostGIS;
            this.layerStatsConfig = global.environment.enabledFeatures.layerStats;
            global.environment.enabledFeatures.layerStats = true;
        });

        after(function () {
            serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            global.environment.enabledFeatures.layerStats = this.layerStatsConfig;
        });

        var cartocssVersion = '2.3.0';
        var cartocss = '#layer { line-width:16; }';

        var mapnikLayer1 = {
            type: 'mapnik',
            options: {
                sql: 'select * from test_table limit 1',
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var mapnikLayer2 = {
            type: 'mapnik',
            options: {
                sql: 'select * from test_table_2 limit 2',
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var mapnikLayer3 = {
            type: 'mapnik',
            options: {
                sql: 'select * from test_table_3 limit 3',
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var mapnikLayer4 = {
            type: 'mapnik',
            options: {
                sql: [
                    'select t1.cartodb_id, t1.the_geom, t1.the_geom_webmercator, t2.address',
                    ' from test_table t1, test_table_2 t2',
                    ' where t1.cartodb_id = t2.cartodb_id'
                ].join(''),
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var mapnikLayer100 = {
            type: 'mapnik',
            options: {
                sql: [
                    'SELECT * FROM test_table_100'
                ].join(''),
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var httpLayer = {
            type: 'http',
            options: {
                urlTemplate: 'http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
                subdomains: ['a', 'b', 'c']
            }
        };

        var mapnikLayerGeomColumn = {
            type: 'mapnik',
            options: {
                sql: 'select *, the_geom as my_geom from test_table_3 limit 2',
                geom_column: 'my_geom',
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        var mapnikLayerNullCats = {
            type: 'mapnik',
            options: {
                sql: `
              WITH geom AS (
                SELECT
                  'SRID=4326;POINT(0 0)'::geometry AS the_geom,
                  'SRID=3857;POINT(0 0)'::geometry AS the_geom_webmercator
              )
              SELECT 1 AS cartodb_id, 'A' As cat, geom.* FROM geom
              UNION
              SELECT 2 AS cartodb_id, 'B' As cat, geom.* FROM geom
              UNION
              SELECT 2 AS cartodb_id, NULL::text As cat, geom.* FROM geom
            `,
                cartocss_version: cartocssVersion,
                cartocss: cartocss
            }
        };

        function mapnikBasicLayerId (index) {
            return 'layer' + index;
        }
        function typeLayerId (type, index) {
            return type + '-' + mapnikBasicLayerId(index);
        }

        it('with one mapnik layer should response with meta-stats for that layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer1
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
                testClient.drain(done);
            });
        });

        it('with two mapnik layer should response with meta-stats for every layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer1,
                    mapnikLayer2
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
                assert.strictEqual(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 2);
                testClient.drain(done);
            });
        });

        it('with three mapnik layer should response with meta-stats for every layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer1,
                    mapnikLayer2,
                    mapnikLayer3
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
                assert.strictEqual(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 2);
                assert.strictEqual(layergroup.metadata.layers[2].id, mapnikBasicLayerId(2));
                assert.strictEqual(layergroup.metadata.layers[2].meta.stats.estimatedFeatureCount, 3);
                testClient.drain(done);
            });
        });

        it('with one mapnik layer (sql with join) should response with meta-stats for that layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer4
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                testClient.drain(done);
            });
        });

        it('with two mapnik layer (sql with join) should response with meta-stats for every layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer4,
                    mapnikLayer4
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
                assert.strictEqual(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 5);
                testClient.drain(done);
            });
        });

        it('with two mapnik layer (with & without join) should response with meta-stats for every layer', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer3,
                    mapnikLayer4
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 3);
                assert.ok(!layergroup.metadata.layers[0].meta.stats[1]);
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(1));
                assert.strictEqual(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 5);
                assert.ok(!layergroup.metadata.layers[2]);
                testClient.drain(done);
            });
        });

        it('with mapnik and layer and httplayer should response with layer metadata with same order', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayer1,
                    httpLayer
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].type, 'mapnik');
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 1);
                assert.strictEqual(layergroup.metadata.layers[1].id, typeLayerId('http', 0));
                assert.strictEqual(layergroup.metadata.layers[1].type, 'http');
                testClient.drain(done);
            });
        });

        it('with httpLayer and mapnik layer should response with layer metadata with same order', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    httpLayer,
                    mapnikLayer1
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, typeLayerId('http', 0));
                assert.strictEqual(layergroup.metadata.layers[0].type, 'http');
                assert.ok(!layergroup.metadata.layers[0].meta.cartocss);
                assert.strictEqual(layergroup.metadata.layers[1].meta.stats.estimatedFeatureCount, 1);
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[1].type, 'mapnik');
                assert.strictEqual(layergroup.metadata.layers[1].meta.cartocss, cartocss);
                testClient.drain(done);
            });
        });

        it('should work with different geom_column', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    mapnikLayerGeomColumn
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                // we don't care about stats here as is an aliased column
                assert.ok(Object.prototype.hasOwnProperty.call(layergroup.metadata.layers[0].meta.stats, 'estimatedFeatureCount'));
                testClient.drain(done);
            });
        });

        it('should not include the stats part if the FF is disabled', function (done) {
            global.environment.enabledFeatures.layerStats = false;
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    httpLayer,
                    mapnikLayer1,
                    httpLayer
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, typeLayerId('http', 0));
                assert.strictEqual(layergroup.metadata.layers[0].type, 'http');
                assert.strictEqual(layergroup.metadata.layers[1].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[1].type, 'mapnik');
                assert.ok(!Object.prototype.hasOwnProperty.call(layergroup.metadata.layers[1].meta, 'stats'));
                assert.strictEqual(layergroup.metadata.layers[2].id, typeLayerId('http', 1));
                assert.strictEqual(layergroup.metadata.layers[2].type, 'http');
                global.environment.enabledFeatures.layerStats = true;
                testClient.drain(done);
            });
        });

        function layerWithMetadata (layer, metadata) {
            return Object.assign(layer, {
                options: Object.assign(layer.options, { metadata })
            });
        }

        it('should provide columns as optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        columns: true
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                const expectedColumns = {
                    cartodb_id: { type: 'number' },
                    the_geom: { type: 'geometry' },
                    the_geom_webmercator: { type: 'geometry' },
                    address: { type: 'string' }
                };
                assert.deepStrictEqual(layergroup.metadata.layers[0].meta.stats.columns, expectedColumns);
                testClient.drain(done);
            });
        });

        // metadata categories are ordered only partially by descending frequency;
        // this orders them completely to avoid ambiguities when comparing
        function withSortedCategories (columns) {
            function catOrder (a, b) {
                if (a.frequency !== b.frequency) {
                    return b.frequency - a.frequency;
                }
                if (a.category < b.category) {
                    return -1;
                }
                if (a.category > b.category) {
                    return +1;
                }
                return 0;
            }
            const sorted = {};
            Object.keys(columns).forEach(name => {
                let data = columns[name];
                if (Object.prototype.hasOwnProperty.call(data, 'categories')) {
                    data = Object.assign(data, { categories: data.categories.sort(catOrder) });
                }
                sorted[name] = data;
            });
            return sorted;
        }

        it('should provide column stats as optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        columnStats: true
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                const expectedColumns = {
                    cartodb_id: {
                        type: 'number',
                        avg: 3,
                        max: 5,
                        min: 1,
                        sum: 15
                    },
                    the_geom: { type: 'geometry' },
                    the_geom_webmercator: { type: 'geometry' },
                    address: {
                        type: 'string',
                        categories: [
                            {
                                category: 'Calle de la Palma 72, Madrid, Spain',
                                frequency: 1
                            },
                            {
                                category: 'Calle de Pérez Galdós 9, Madrid, Spain',
                                frequency: 1
                            },
                            {
                                category: 'Calle Divino Pastor 12, Madrid, Spain',
                                frequency: 1
                            },
                            {
                                category: 'Manuel Fernández y González 8, Madrid, Spain',
                                frequency: 1
                            },
                            {
                                category: 'Plaza Conde de Toreno 2, Madrid, Spain',
                                frequency: 1
                            }
                        ]
                    }
                };
                assert.deepStrictEqual(
                    withSortedCategories(layergroup.metadata.layers[0].meta.stats.columns),
                    withSortedCategories(expectedColumns)
                );
                testClient.drain(done);
            });
        });

        it('should limit the number of categories as requested', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        columnStats: { topCategories: 2 }
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                const columnsMetadata = layergroup.metadata.layers[0].meta.stats.columns;
                assert.strictEqual(columnsMetadata.address.categories.length, 2);
                testClient.drain(done);
            });
        });

        it('should include null categories if requested', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayerNullCats, {
                        columnStats: { includeNulls: true }
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                const columnsMetadata = layergroup.metadata.layers[0].meta.stats.columns;
                assert.strictEqual(columnsMetadata.cat.categories.length, 3);
                testClient.drain(done);
            });
        });

        it('should not include null categories if not requested', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayerNullCats, {
                        columnStats: { includeNulls: false }
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                const columnsMetadata = layergroup.metadata.layers[0].meta.stats.columns;
                assert.strictEqual(columnsMetadata.cat.categories.length, 2);
                testClient.drain(done);
            });
        });

        it('should provide row count as optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        featureCount: true
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.featureCount, 5);
                testClient.drain(done);
            });
        });

        it('should provide geometry type as optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        geometryType: true
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.geometryType, 'ST_Point');
                testClient.drain(done);
            });
        });

        it('should not fail "TypeError: ... \'geom_type\' of undefined" for empty results', function (done) {
            var testClient = new TestClient({
                version: '1.8.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from test_table where false',
                            metadata: {
                                geometryType: true
                            }
                        }
                    }
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.geometryType, undefined);
                testClient.drain(done);
            });
        });

        it('should provide a sample as optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer100, {
                        sample: { num_rows: 30 }
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 100);
                assert(layergroup.metadata.layers[0].meta.stats.sample.length > 0);
                const expectedCols = ['cartodb_id', 'value', 'the_geom', 'the_geom_webmercator'].sort();
                assert.deepStrictEqual(Object.keys(layergroup.metadata.layers[0].meta.stats.sample[0]).sort(), expectedCols);
                testClient.drain(done);
            });
        });

        it('should not provide a sample when the source table is empty', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'SELECT * FROM test_table_100 limit 0',
                            cartocss_version: '2.3.0',
                            cartocss: '#layer { line-width:16; }',
                            metadata: {
                                sample: {
                                    num_rows: 30
                                }
                            }
                        }
                    }
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.deepStrictEqual(layergroup.metadata.layers[0].meta.stats.sample, {});
                testClient.drain(done);
            });
        });

        it('can specify sample columns', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer100, {
                        sample: {
                            num_rows: 30,
                            include_columns: ['cartodb_id', 'the_geom']
                        }
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 100);
                assert(layergroup.metadata.layers[0].meta.stats.sample.length > 0);
                const expectedCols = ['cartodb_id', 'the_geom'].sort();
                assert.deepStrictEqual(Object.keys(layergroup.metadata.layers[0].meta.stats.sample[0]).sort(), expectedCols);
                testClient.drain(done);
            });
        });

        it('should only provide requested optional metadata', function (done) {
            var testClient = new TestClient({
                version: '1.4.0',
                layers: [
                    layerWithMetadata(mapnikLayer4, {
                        geometryType: true,
                        featureCount: true
                    })
                ]
            });

            testClient.getLayergroup(function (err, layergroup) {
                assert.ifError(err);
                assert.strictEqual(layergroup.metadata.layers[0].id, mapnikBasicLayerId(0));
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.estimatedFeatureCount, 5);
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.geometryType, 'ST_Point');
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.featureCount, 5);
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.sample, undefined);
                assert.strictEqual(layergroup.metadata.layers[0].meta.stats.columns, undefined);
                testClient.drain(done);
            });
        });
    });
});
