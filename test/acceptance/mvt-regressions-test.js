'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/server-options');

const suites = [
    {
        desc: 'mapnik',
        usePostGIS: false
    },
    {
        desc: 'postgis',
        usePostGIS: true
    }
];

describe('mvt regressions', function () {
    suites.forEach((suite) => {
        const { desc, usePostGIS } = suite;

        describe(desc, function () {
            const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

            before(function () {
                serverOptions.renderer.mvt.usePostGIS = usePostGIS;
            });

            after(function () {
                serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            it('should not error on missing column from aggregation', function (done) {
                const mapConfig = {
                    version: '1.7.0',
                    layers: [
                        {
                            type: 'cartodb',
                            options: {
                                sql: 'select * from populated_places_simple_reduced',
                                aggregation: {
                                    placement: 'point-sample',
                                    columns: {
                                        pop_max_avg: {
                                            aggregate_function: 'avg',
                                            aggregated_column: 'pop_max'
                                        }
                                    },
                                    threshold: 1
                                }
                            }
                        }
                    ]
                };

                this.testClient = new TestClient(mapConfig);
                this.testClient.getLayergroup((err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));

                    done();
                });
            });
        });
    });
});

describe('MVT Mapnik', function () {
    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

    before(function () {
        serverOptions.renderer.mvt.usePostGIS = false;
    });

    after(function () {
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    afterEach(function (done) {
        this.testClient.drain(done);
    });

    it('invalid properties', function (done) {
        const query = `
            select ldc, cartodb_id, _2016_6_partcntry, the_geom_webmercator, country
            from countries_null_values
            where country = 'Kenya' OR country = 'Sudan' LIMIT 3
        `;

        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: query
                    }
                }
            ]
        };

        const handler = (resolve, reject) => {
            return (err, res, MVT) => {
                if (err) {
                    return reject(err);
                }
                try {
                    const geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
                    const sudanFeature = geojsonTile.features.filter(_ => {
                        return _.properties.country === 'Sudan';
                    })[0];
                    if (!sudanFeature) {
                        return reject(new Error('Missing country=\'Sudan\''));
                    }

                    resolve(sudanFeature);
                } catch (err) {
                    resolve(err);
                }
            };
        };

        this.testClient = new TestClient(mapConfig);
        const tile487 = new Promise((resolve, reject) => {
            this.testClient.getTile(4, 8, 7, { format: 'mvt', layer: 0 }, handler(resolve, reject));
        });
        const tile497 = new Promise((resolve, reject) => {
            this.testClient.getTile(4, 9, 7, { format: 'mvt', layer: 0 }, handler(resolve, reject));
        });
        Promise.all([tile487, tile497])
            .then(features => {
                const [tile487SudanFeature, tile497SudanFeature] = features;
                assert.strictEqual(tile487SudanFeature.properties._2016_6_partcntry, 0);
                assert.strictEqual(tile497SudanFeature.properties._2016_6_partcntry, 0);
                return done();
            })
            .catch(err => done(err));
    });

    it('should not convert boolean to numeric', function (done) {
        const geomWebmercator = 'st_transform(st_setsrid(st_makepoint(10, 10), 4326), 3857) as the_geom_webmercator';
        const sql = `SELECT ${geomWebmercator}, FALSE as status, 0 as data`;

        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: { sql }
                }
            ]
        };

        this.testClient = new TestClient(mapConfig);
        this.testClient.getTile(0, 0, 0, { format: 'mvt', layer: 0 }, (err, res, MVT) => {
            if (err) {
                return done(err);
            }

            const geojsonTile = JSON.parse(MVT.toGeoJSONSync(0));
            assert.strictEqual(geojsonTile.features[0].properties.status, false);
            assert.strictEqual(geojsonTile.features[0].properties.data, 0);
            done();
        });
    });
});
