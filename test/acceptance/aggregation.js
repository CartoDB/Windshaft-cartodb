require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');

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
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const POINTS_SQL_TIMESTAMP_1 = `
    select
        row_number() over() AS cartodb_id,
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value,
        date
    from
        generate_series(-3, 3) x,
        generate_series(
            '2007-02-15 01:00:00'::timestamp, '2007-02-18 01:00:00'::timestamp, '1 day'::interval
        ) date
    `;

    const POINTS_SQL_2 = `
    select
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326), 3857) as the_geom_webmercator,
        x as value,
        x*x as  sqrt_value
    from generate_series(-3, 3) x
    `;

    const POLYGONS_SQL_1 = `
    select
        x + 4 as cartodb_id,
        st_buffer(st_setsrid(st_makepoint(x*10, x*10), 4326)::geography, 100000)::geometry as the_geom,
        st_transform(
            st_buffer(st_setsrid(st_makepoint(x*10, x*10), 4326)::geography, 100000)::geometry,
            3857
        ) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const SQL_WRAP = `
    WITH hgrid AS (
        SELECT
            CDB_RectangleGrid (
                ST_Expand(!bbox!, CDB_XYZ_Resolution(1) * 12),
                CDB_XYZ_Resolution(1) * 12,
                CDB_XYZ_Resolution(1) * 12
            ) as cell
    )
    SELECT
        hgrid.cell as the_geom_webmercator,
        count(1) as agg_value,
        count(1) /power( 12 * CDB_XYZ_Resolution(1), 2 ) as agg_value_density,
        row_number() over () as cartodb_id
    FROM hgrid, (<%= sql %>) i
    WHERE ST_Intersects(i.the_geom_webmercator, hgrid.cell) GROUP BY hgrid.cell
    `;

    const TURBO_CARTOCSS_SQL_WRAP = `
        #layer {
            polygon-fill: ramp([agg_value], (#245668, #04817E, #39AB7E, #8BD16D, #EDEF5D), quantiles);
        }
        #layer::outline {
            line-width: 1;
            line-color: #FFFFFF;
            line-opacity: 1;
        }
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
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1
                            }
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            aggregation: {
                                threshold: 1
                            }
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
                    body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.png));

                    done();
                });
            });

            it('should return a NOT aggregated layergroup', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
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

                    body.metadata.layers.forEach(layer => assert.equal(layer.meta.aggregation, undefined));

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
                                },
                                threshold: 1
                            },
                            cartocss: '#layer { marker-width: [total]; }',
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
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('should fail when aggregation and cartocss are not compatible', function (done) {
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
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                threshold: 1
                            },
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

                    assert.ok(body.errors[0].match(/column "value" does not exist/));

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
                            aggregation: {
                                threshold: 1
                            },
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

                    assert.ok(body.errors[0].match(/column "value" does not exist/));

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
                                },
                                threshold: 1
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

                    body.metadata.layers.forEach(layer => assert.equal(layer.meta.aggregation, undefined));

                    done();
                });
            });

            it('when the aggregation param is not valid should respond with error', function (done) {
                const mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);
                const options = {
                    response: {
                        status: 400
                    },
                    aggregation: 'wadus'
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [
                            "Invalid value for 'aggregation' query param: wadus." +
                                " Valid ones are 'true' or 'false'"
                        ],
                        errors_with_context:[{
                            type: 'unknown',
                            message: "Invalid value for 'aggregation' query param: wadus." +
                                " Valid ones are 'true' or 'false'"
                        }]
                    });

                    done();
                });
            });

            it('when the layer\'s row count is lower than threshold should skip aggregation', function (done) {
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
                                },
                                threshold: 1001
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);
                const options = {};

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer =>{
                        assert.deepEqual(layer.meta.aggregation, { png: false, mvt: false });
                    });

                    done();
                });
            });

            it('when the layer\'s geometry type is not point should respond with error', function (done) {
                const mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POLYGONS_SQL_1,
                            aggregation: {
                                threshold: 1
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);
                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [
                            'Unsupported geometry type: ST_Polygon.' +
                                ' Aggregation is available only for geometry type: ST_Point'
                        ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Unsupported geometry type: ST_Polygon.' +
                            ' Aggregation is available only for geometry type: ST_Point',
                            layer: {
                                id: 'layer0',
                                index: 0,
                                type: 'mapnik'
                            }
                        }]
                    });

                    done();
                });
            });

            it('when sql_wrap is provided should return a layergroup', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql_wrap: SQL_WRAP,
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1
                            },
                            cartocss: TURBO_CARTOCSS_SQL_WRAP,
                            cartocss_version: '3.0.12'
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
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('when sql_wrap is provided should return a tile', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql_wrap: SQL_WRAP,
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1
                            },
                            cartocss: TURBO_CARTOCSS_SQL_WRAP,
                            cartocss_version: '3.0.12'
                        }
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);

                this.testClient.getTile(0, 0, 0, {}, (err) => {
                    if (err) {
                        return done(err);
                    }

                    done();
                });
            });

            it('when dimensions is provided should return a tile returning the column used as dimensions',
            function (done) {

                // FIXME: skip until pg-mvt renderer is able to return all columns
                if (process.env.POSTGIS_VERSION === '2.4') {
                    return done();
                }

                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    value: "value"
                                }
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
                const options = {
                    format: 'mvt'
                };
                this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                    if (err) {
                        return done(err);
                    }

                    const tileJSON = tile.toJSON();

                    tileJSON[0].features.forEach(feature => assert.equal(typeof feature.properties.value, 'number'));

                    done();
                });
            });

            it('should work when the sql has single quotes', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: `
                            SELECT
                                the_geom_webmercator,
                                the_geom,
                                value,
                                DATE_PART('day', date::timestamp - '1912-12-31 01:00:00'::timestamp )::numeric AS day
                            FROM (${POINTS_SQL_TIMESTAMP_1}) _query
                            `,
                            aggregation: {
                                threshold: 1
                            }
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
                    body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.png));

                    done();
                });
            });

            it('aggregates with point-grid placement', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                placement: 'point-grid',
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    },
                                    v_avg: {
                                        aggregate_function: 'avg',
                                        aggregated_column: 'value'
                                    }
                                },
                                threshold: 1
                            },
                            cartocss: '#layer { marker-width: [total]; }',
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
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('aggregates with point-sample placement', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                placement: 'point-sample',
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    },
                                    v_avg: {
                                        aggregate_function: 'avg',
                                        aggregated_column: 'value'
                                    }
                                },
                                threshold: 1
                            },
                            cartocss: '#layer { marker-width: [total]; }',
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
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('aggregates with centroid placement', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                placement: 'centroid',
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    },
                                    v_avg: {
                                        aggregate_function: 'avg',
                                        aggregated_column: 'value'
                                    }
                                },
                                threshold: 1
                            },
                            cartocss: '#layer { marker-width: [total]; }',
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
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('aggregates with full-sample placement', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            resolution: 256,
                            aggregation: {
                                placement: 'point-grid',
                                columns: {
                                    total: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    },
                                    v_avg: {
                                        aggregate_function: 'avg',
                                        aggregated_column: 'value'
                                    }
                                },
                                threshold: 1
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                this.testClient.getTile(0, 0, 0, { format: 'mvt' }, function (err, res, mvt) {
                    if (err) {
                        return done(err);
                    }

                    const geojsonTile = JSON.parse(mvt.toGeoJSONSync(0));

                    assert.ok(Array.isArray(geojsonTile.features));
                    assert.ok(geojsonTile.features.length > 0);

                    const feature = geojsonTile.features[0];

                    assert.ok(feature.properties.hasOwnProperty('value'), 'Missing value property');

                    done();
                });
            });

            it('should fail with bad resolution', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        id: 'wadus',
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                resolution: 'wadus',
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Invalid resolution, should be a number greather than 0' ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Invalid resolution, should be a number greather than 0',
                            layer: {
                                "id": "wadus",
                                "index": 0,
                                "type": "mapnik"
                            }
                        }]
                    });
                    done();
                });
            });

            it('should fail with bad placement', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                placement: 'wadus',
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Invalid placement. Valid values: centroid, point-grid, point-sample, full-sample'],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Invalid placement. Valid values: centroid, point-grid, point-sample, full-sample',
                            layer: {
                                id: "layer0",
                                index: 0,
                                type: "mapnik",
                            }
                        }]
                    });

                    done();
                });
            });

            it('should fail with bad threshold', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 'wadus',
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Invalid threshold, should be a number greather than 0' ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Invalid threshold, should be a number greather than 0',
                            layer: {
                                "id": "layer0",
                                "index": 0,
                                "type": "mapnik"
                            }
                        }]
                    });

                    done();
                });
            });

            it('should fail with bad column name', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns : {
                                    '': {
                                        aggregate_function: 'count',
                                        aggregated_column: 'value',
                                    }
                                },
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Invalid column name, should be a non empty string' ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Invalid column name, should be a non empty string',
                            layer: {
                                "id": "layer0",
                                "index": 0,
                                "type": "mapnik"
                            }
                        }]
                    });

                    done();
                });
            });

            it('should fail with bad aggregated function', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns : {
                                    'wadus_function': {
                                        aggregate_function: 'wadus',
                                        aggregated_column: 'value',
                                    }
                                },
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Unsupported aggregation function wadus, ' +
                                    'valid ones: count, avg, sum, min, max, mode' ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Unsupported aggregation function wadus, ' +
                                    'valid ones: count, avg, sum, min, max, mode',
                            layer: {
                                "id": "layer0",
                                "index": 0,
                                "type": "mapnik"
                            }
                        }]
                    });

                    done();
                });
            });

            it('should fail with bad aggregated columns', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns : {
                                    'total_wadus': {
                                        aggregate_function: 'sum',
                                        aggregated_column: '',
                                    }
                                },
                            }
                        }
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);

                const options = {
                    response: {
                        status: 400
                    }
                };

                this.testClient.getLayergroup(options, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, {
                        errors: [ 'Invalid aggregated column, should be a non empty string' ],
                        errors_with_context:[{
                            type: 'layer',
                            message: 'Invalid aggregated column, should be a non empty string',
                            layer: {
                                "id": "layer0",
                                "index": 0,
                                "type": "mapnik"
                            }
                        }]
                    });

                    done();
                });
            });

        });
    });
});
