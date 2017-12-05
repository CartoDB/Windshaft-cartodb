require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');
const MISSING_AGGREGATION_COLUMNS = 'Missing columns in the aggregation. The map-config defines cartocss expressions,'+
    ' interactivity fields or attributes that are not present in the aggregation';

const suites = [{
    desc: 'mvt (mapnik)',
    usePostGIS: false
}];

if (process.env.POSTGIS_VERSION === '2.4') {
    suites.push({
        desc: 'mvt (postgis)',
        usePostGIS: true
    });
}

describe('aggregation', function () {

    const POINTS_SQL_1 = `
    select
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const POINTS_SQL_2 = `
    select
        st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326), 3857) as the_geom_webmercator,
        x as value,
        x*x as  sqrt_value
    from generate_series(-3, 3) x
    `;

    function createVectorMapConfig (layers = [
        {
            type: 'cartodb',
            options: {
                sql: POINTS_SQL_1,
                aggregation: true
            }
        },
        {
            type: 'cartodb',
            options: {
                sql: POINTS_SQL_2,
                aggregation: true
            }
        }
    ]) {
        return {
            version: '1.6.0',
            layers: layers
        };
    }

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

            it('should return a layergroup indicating the mapconfig was aggregated', function (done) {
                this.mapConfig = createVectorMapConfig();
                this.testClient = new TestClient(this.mapConfig);

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

            it('should return a layergroup with aggregation and cartocss compatible', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                }
                            },
                            cartocss: '#layer { marker-width: [value]; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
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

            it('should fail if cartocss uses "value" column and it\'s not defined in the aggregation',
            function (done) {
                const response = {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            aggregation: true,
                            cartocss: '#layer { marker-width: [value]; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
                this.testClient.getLayergroup({ response }, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(body.errors[0], MISSING_AGGREGATION_COLUMNS);

                    done();
                });
            });

            it('should fail if aggregation misses a column defined in interactivity',
            function (done) {
                const response = {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            aggregation: {
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                }
                            },
                            cartocss: '#layer { marker-width: [value]; }',
                            cartocss_version: '2.3.0',
                            interactivity: ['sqrt_value']
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
                this.testClient.getLayergroup({ response }, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(body.errors[0], MISSING_AGGREGATION_COLUMNS);

                    done();
                });
            });

            it('should skip aggregation to create a layergroup with aggregation defined already', function (done) {
                const mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                }
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);
                const options = { aggregation: false };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation === undefined));

                    done();
                });
            });
        });
    });
});
