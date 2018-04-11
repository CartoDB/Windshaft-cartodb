require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');

const suites = [{
    desc: 'regressions mvt (mapnik)',
    usePostGIS: false
}];

if (process.env.POSTGIS_VERSION === '2.4') {
    suites.push({
        desc: 'regressions mvt (postgis)',
        usePostGIS: true
    });
}

describe('aggregation', function () {

    suites.forEach((suite) => {
        const { desc, usePostGIS } = suite;

        describe(desc, function () {
            const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

            before(function () {
                serverOptions.renderer.mvt.usePostGIS = usePostGIS;
            });

            after(function (){
                serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            it('aggregates with centroid placement', function (done) {
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

                    assert.equal(typeof body.metadata, 'object');
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

    after(function (){
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    afterEach(function (done) {
        this.testClient.drain(done);
    });

    it('invalid properties', function (done) {
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select * from countries_null_values',
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
                        return reject(new Error(`Missing country='Sudan'`));
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
});
