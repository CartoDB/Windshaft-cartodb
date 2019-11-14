'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/server-options');

const WebMercatorHelper = require('cartodb-query-tables').utils.webMercatorHelper;
const webmercator = new WebMercatorHelper();

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

// Generate points with values and times.
// The point location is spanned over a given length, by default it is 0 so
// all points have the same location, which can be used to test aggregation dimensions
// the default point is in tile
function pointsWithTimeSQL (n, startTime, endTime, span = 0, x0 = 0.1, y0 = 0.1) {
    return `
        WITH params AS (
        SELECT
        '${startTime}'::timestamp with time zone AS min_t,
        '${endTime}'::timestamp with time zone AS max_t,
        ${x0} AS x0, ${y0} AS y0,
        ${span} AS length,
        ${n} AS n
        ),
        positions AS (
        SELECT
            step::float8/n AS s,
            x0 + (step::float8/n - 0.5)*length AS x, y0 AS y
        FROM params, generate_series(1, n) AS step
        )
        SELECT
        row_number() over () AS cartodb_id,
        n*10 AS value,
        min_t + (max_t - min_t)*s AS date,
        ST_SetSRID(ST_MakePoint(x, y), 4326) AS the_geom,
        ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 4326), 3857) AS the_geom_webmercator
        FROM params, positions
    `;
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

    const POINTS_SQL_0 = `
    select
        x + 4 as cartodb_id,
        st_setsrid(st_makepoint(x*10+1, x*10+1), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10+1, x*10+1), 4326), 3857) as the_geom_webmercator,
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

    const POINTS_OVER_THRESHOLD = 'SELECT * FROM test_table_200k';

    const POLYGONS_SQL_1 = `
    select
        x + 4 as cartodb_id,
        st_buffer(st_setsrid(st_makepoint(x*10, x*10), 4326), 10) as the_geom,
        st_transform(
            st_buffer(st_setsrid(st_makepoint(x*10, x*10), 4326), 10),
            3857
        ) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const SQL_WRAP = `
    WITH hgrid AS (
        SELECT
            CDB_RectangleGrid (
                ST_Expand(!bbox!, ${webmercator.getResolution({ z: 1 })} * 12),
                ${webmercator.getResolution({ z: 1 })} * 12,
                ${webmercator.getResolution({ z: 1 })} * 12
            ) as cell
    )
    SELECT
        hgrid.cell as the_geom_webmercator,
        count(1) as agg_value,
        count(1) /power( 12 * ${webmercator.getResolution({ z: 1 })}, 2 ) as agg_value_density,
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

    const POINTS_SQL_ONLY_WEBMERCATOR = `
    select
        x + 4 as cartodb_id,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const POINTS_SQL_PAIRS = `
    -- Generate pairs of near points
    select
        x + 1 as cartodb_id,
        st_setsrid(
            st_makepoint(
                Floor((x-6)/2)*10 + 9E-3*(x % 2 + 1),
                Floor((x-6)/2)*10 + 9E-3*(x % 2 + 1)
            ),
            4326
        ) as the_geom,
        st_transform(
            st_setsrid(
                st_makepoint(
                    Floor((x-6)/2)*10 + 9E-3*(x % 2 + 1),
                    Floor((x-6)/2)*10 + 9E-3*(x % 2 + 1)
                ),
                4326
            ),
            3857
        ) as the_geom_webmercator,
        x as value
    from generate_series(0, 13) x
    `;

    // Some points at corners and centers of aggregation grids (zoom=1, resolution=1)
    //     @ = point location
    //     --+---+---+---+---+---+---+--
    //       |   |   |   |   |   |   |
    //     --+---+---@---@---@---+---+--
    //       |   |   | @ | @ |   |   |
    //     --+---+---@---@---@---+---+--- Y = 0
    //       |   |   | @ | @ |   |   |
    //     --+---+---@---@---@---+---+--
    //       |   |   |   |   |   |   |
    //     --+---+---+---+---+---+---+--
    //                   |
    //                 X = 0
    // Point identifiers (cartodb_id)
    //     --+---+---+---+---+---+---+--
    //       |   |   |   |   |   |   |
    //     --+---+---7---8---9---+---+--
    //       |   |   |12 |13 |   |   |
    //     --+---+---4---5---6---+---+---
    //       |   |   |10 |11 |   |   |
    //     --+---+---1---2---3---+---+--
    //       |   |   |   |   |   |   |
    //     --+---+---+---+---+---+---+--
    // Point count per aggregation cell and Z=1 tiles
    //
    //    Tile 0,0  -+---+---+---+- Tile 1,0
    //       |   |   | 1 | 1 | 1 |   |
    //     --+---+---@---@---@---+---+--
    //       |   |   | 2 | 2 | 1 |   |
    //     --+---+---@---@---@---+---+---
    //       |   |   | 2 | 2 | 1 |   |
    //     --+---+---@---@---@---+---+--
    //       |   |   |   |   |   |   |
    //    Tile 0, 1 -+---+---+---+- Tile 1,1
    //
    const POINTS_SQL_GRID = (z, resolution) => `
        WITH params AS (
            SELECT ${webmercator.getResolution({ z: z })}*${resolution} AS l -- cell size for Z, resolution
        )
        SELECT
            row_number() OVER () AS cartodb_id,
            ST_SetSRID(ST_MakePoint(x*l, y*l), 3857) AS the_geom_webmercator,
            ST_Transform(ST_SetSRID(ST_MakePoint(x*l, y*l), 3857), 4326) AS the_geom
            FROM params, generate_series(-1,1) x, generate_series(-1,1) y
        UNION ALL
        SELECT
            row_number() OVER () + 9 AS cartodb_id,
            ST_SetSRID(ST_MakePoint(x*l-l/2, y*l-l/2), 3857) AS the_geom_webmercator,
            ST_Transform(ST_SetSRID(ST_MakePoint(x*l-l/2, y*l-l/2), 3857), 4326) AS the_geom
            FROM params, generate_series(0,1) x, generate_series(0,1) y
    `;

    // Points positioned inside one cell of Z=20, X=1000000, X=1000000 (the SW corner)
    // The center of the cell is x = 18181005.874444414, y = -18181043.94366749
    const POINTS_SQL_CELL = `
      SELECT
        1 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181005.82, -18181043.9), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181005.82, -18181043.9), 3857), 4326) AS the_geom
      UNION ALL SELECT
        2 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181005.9, -18181044.0), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181005.9, -18181044.0), 3857), 4326) AS the_geom
      UNION ALL SELECT
        3 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181005.87, -18181043.94), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181005.87, -18181043.94), 3857), 4326) AS the_geom
      UNION ALL SELECT
        4 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181005.82, -18181043.9), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181005.82, -18181043.9), 3857), 4326) AS the_geom
    `;

    // Points positioned inside one cell of Z=20, X=1000000, X=1000000 (inner cell not on border)
    // The center of the cell is x = 18181006.023735486, y = -18181043.794376418
    const POINTS_SQL_CELL_INNER = `
      SELECT
        1 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181005.95, -18181043.8), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181005.95, -18181043.8), 3857), 4326) AS the_geom
      UNION ALL SELECT
        2 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181006.09, -18181043.74), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181006.09, -18181043.74), 3857), 4326) AS the_geom
      UNION ALL SELECT
        3 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181006.02, -18181043.79), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181006.02, -18181043.79), 3857), 4326) AS the_geom
      UNION ALL SELECT
        4 AS cartodb_id,
        ST_SetSRID(ST_MakePoint(18181006.01, -18181043.75), 3857) AS the_geom_webmercator,
        ST_Transform(ST_SetSRID(ST_MakePoint(18181006.01, -18181043.75), 3857), 4326) AS the_geom
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
                this.layerStatsConfig = global.environment.enabledFeatures.layerStats;
            });

            after(function () {
                serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            });

            afterEach(function (done) {
                this.testClient.drain(done);
                global.environment.enabledFeatures.layerStats = this.layerStatsConfig;
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

                    assert.strictEqual(typeof body.metadata, 'object');
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

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.strictEqual(layer.meta.aggregation, undefined));

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

                    assert.strictEqual(typeof body.metadata, 'object');
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
                                    threshold: 1,
                                    placement: 'centroid'
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

            it('should provide all columns in the default aggregation ',
                function (done) {
                    const response = {
                        status: 200,
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

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));
                        done();
                    });
                });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it('should provide all the requested columns in non-default aggregation: ' + placement,
                    function (done) {
                        const response = {
                            status: 200,
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
                                        placement: placement,
                                        columns: {
                                            first_column: {
                                                aggregate_function: 'sum',
                                                aggregated_column: 'value'
                                            }
                                        },
                                        dimensions: {
                                            second_column: 'sqrt_value'
                                        },
                                        threshold: 1
                                    },
                                    cartocss: '#layer { marker-width: [first_column]; line-width: [second_column]; }',
                                    cartocss_version: '2.3.0'
                                }
                            }
                        ]);

                        this.testClient = new TestClient(this.mapConfig);
                        this.testClient.getLayergroup({ response }, (err, body) => {
                            if (err) {
                                return done(err);
                            }

                            assert.strictEqual(typeof body.metadata, 'object');
                            assert.ok(Array.isArray(body.metadata.layers));

                            body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                            body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));
                            done();
                        });
                    });

                it('should provide only the requested columns in non-default aggregation: ' + placement,
                    function (done) {
                        this.mapConfig = createVectorMapConfig([
                            {
                                type: 'cartodb',
                                options: {
                                    sql: POINTS_SQL_2,
                                    aggregation: {
                                        placement: placement,
                                        columns: {
                                            first_column: {
                                                aggregate_function: 'sum',
                                                aggregated_column: 'value'
                                            }
                                        },
                                        dimensions: {
                                            second_column: 'sqrt_value'
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
                            let columns = new Set();
                            geojsonTile.features.forEach(f => {
                                Object.keys(f.properties).forEach(p => columns.add(p));
                            });
                            columns = Array.from(columns);
                            const expectedColumns = [
                                '_cdb_feature_count', 'cartodb_id', 'first_column', 'second_column'
                            ];
                            assert.deepStrictEqual(columns.sort(), expectedColumns.sort());

                            done();
                        });
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

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.strictEqual(layer.meta.aggregation, undefined));

                    done();
                });
            });

            it('skip default aggregation by setting `aggregation: false` for just one layer', function (done) {
                const mapConfig = createVectorMapConfig([
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
                            // Note that we need the table to have more than AggregationMapConfig.THRESHOLD rows
                            // otherwise it won't get aggregated in any case
                            sql: POINTS_OVER_THRESHOLD,
                            aggregation: false
                        }
                    }

                ]);

                this.testClient = new TestClient(mapConfig);

                this.testClient.getLayergroup((err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    assert.strictEqual(body.metadata.layers[0].meta.aggregation.mvt, true);
                    assert.strictEqual(body.metadata.layers[1].meta.aggregation.mvt, false);

                    done();
                });
            });

            it('use default aggregation by setting `aggregation: true`', function (done) {
                const mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_OVER_THRESHOLD,
                            cartocss: '#layer { marker-width: 7; }',
                            cartocss_version: '2.3.0',
                            aggregation: true
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);

                this.testClient.getLayergroup((err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    assert.strictEqual(body.metadata.layers[0].meta.aggregation.mvt, true);
                    assert.strictEqual(body.metadata.layers[0].meta.aggregation.png, true);

                    done();
                });
            });

            it('but do not aggregate below threshold by setting `aggregation: true`', function (done) {
                const mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            cartocss: '#layer { marker-width: 7; }',
                            cartocss_version: '2.3.0',
                            aggregation: true
                        }
                    }
                ]);

                this.testClient = new TestClient(mapConfig);

                this.testClient.getLayergroup((err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    assert.strictEqual(body.metadata.layers[0].meta.aggregation.mvt, false);
                    assert.strictEqual(body.metadata.layers[0].meta.aggregation.png, false);

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

                    assert.deepStrictEqual(body, {
                        errors: [
                            "Invalid value for 'aggregation' query param: wadus." +
                                " Valid ones are 'true' or 'false'"
                        ],
                        errors_with_context: [{
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

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => {
                        assert.deepStrictEqual(layer.meta.aggregation, { png: false, mvt: false });
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
                            cartocss: '#layer { marker-width: [value]; }',
                            cartocss_version: '2.3.0',
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

                    assert.deepStrictEqual(body, {
                        errors: [
                            'Unsupported geometry type: ST_Polygon.' +
                                ' Aggregation is available only for geometry type: ST_Point'
                        ],
                        errors_with_context: [{
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

                    assert.strictEqual(typeof body.metadata, 'object');
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
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    threshold: 1,
                                    dimensions: {
                                        value: 'value'
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

                        tileJSON[0].features.forEach(feature => assert.strictEqual(typeof feature.properties.value, 'number'));

                        done();
                    });
                });

            it('time dimensions', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_TIMESTAMP_1,
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    dow: {
                                        column: 'date',
                                        group: {
                                            units: 'dayOfWeek'
                                        }
                                    }
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

                    tileJSON[0].features.forEach(feature => assert.strictEqual(typeof feature.properties.dow, 'number'));

                    done();
                });
            });

            it('aggregation dimensions only used if present', function (done) {
                const nPoints = 50;
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(nPoints, '2000-01-01T00:00:00+00', '2019-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1
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
                    // Everything's aggregated into a single feature because the only
                    // dimension is space and all points are in the same place.
                    assert.deepStrictEqual(tileJSON[0].features.map(f => f.properties._cdb_feature_count), [nPoints]);
                    done();
                });
            });

            it('aggregation dimension year used', function (done) {
                const nPoints = 50;
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(nPoints, '2000-01-01T00:00:00+00', '2019-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    year: {
                                        column: 'date',
                                        group: {
                                            units: 'year'
                                        }
                                    }
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
                    // Now all features have same location, but the year is an additional dimension
                    // with 20 different values, so we'll have an aggregated feature for each.
                    const expectedYears = Array.from({ length: 20 }, (_, k) => 2000 + k); // 2000 to 2019
                    const resultYears = tileJSON[0].features.map(f => f.properties.year).sort((a, b) => a - b);
                    assert.deepStrictEqual(resultYears, expectedYears);

                    done();
                });
            });

            it('aggregation dimension month with count', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    month: {
                                        column: 'date',
                                        group: {
                                            units: 'month',
                                            count: 5,
                                            starting: '2018-01'
                                        }
                                    }
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
                    assert.strictEqual(tileJSON[0].features.length, 3);
                    const resultQuimesters = tileJSON[0].features.map(f => f.properties.month).sort((a, b) => a - b);
                    assert.deepStrictEqual(resultQuimesters, [1, 2, 3]);

                    done();
                });
            });

            it('aggregation dimension month with starting', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    month: {
                                        column: 'date',
                                        group: {
                                            units: 'month',
                                            starting: '2017-01'
                                        }
                                    }
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
                    const resultMonths = tileJSON[0].features.map(f => f.properties.month).sort((a, b) => a - b);
                    assert.deepStrictEqual(resultMonths, [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);

                    done();
                });
            });

            it('aggregation dimension month by default UTC', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-01-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    dow: {
                                        column: 'date',
                                        group: {
                                            units: 'month',
                                            timezone: '+00'
                                        }
                                    }
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
                    // In UTC all times are in the same month 2018-01
                    assert.strictEqual(tileJSON[0].features.length, 1);

                    done();
                });
            });

            it('aggregation dimension month with timezone', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-01-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    dow: {
                                        column: 'date',
                                        group: {
                                            units: 'month',
                                            timezone: '+7200'
                                        }
                                    }
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
                    // In UTC+2 some times are in a different month
                    assert.strictEqual(tileJSON[0].features.length, 2);
                    done();
                });
            });

            it('time dimensions stats', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_TIMESTAMP_1,
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    dow: {
                                        column: 'date',
                                        group: {
                                            units: 'dayOfWeek'
                                        }
                                    }
                                }
                            },
                            metadata: {
                                dimensions: true
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
                this.testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    const expectedDimensions = {
                        dow:
                        {
                            params:
                           {
                               time: 'to_timestamp("date")',
                               timezone: 'utc',
                               units: 'dayOfWeek',
                               count: 1
                           },
                            min: 4,
                            max: 7,
                            type: 'number'
                        }
                    };
                    assert.deepStrictEqual(layergroup.metadata.layers[0].meta.stats.dimensions, expectedDimensions);
                    done();
                });
            });

            it('no time dimensions stats by default', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_TIMESTAMP_1,
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    dow: {
                                        column: 'date',
                                        group: {
                                            units: 'dayOfWeek'
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]);

                this.testClient = new TestClient(this.mapConfig);
                this.testClient.getLayergroup(function (err, layergroup) {
                    assert.ifError(err);
                    assert(!layergroup.metadata.layers[0].meta.stats.dimensions);
                    done();
                });
            });

            it('aggregation dimension month iso format', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    month: {
                                        column: 'date',
                                        group: {
                                            units: 'month'
                                        },
                                        format: 'iso'
                                    }
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
                    const resultMonths = tileJSON[0].features.map(f => f.properties.month).sort();
                    assert.deepStrictEqual(resultMonths, [
                        '2018-01', '2018-02', '2018-03', '2018-04', '2018-05', '2018-06',
                        '2018-07', '2018-08', '2018-09', '2018-10', '2018-11', '2018-12'
                    ]);
                    done();
                });
            });

            it('aggregation dimension month iso format with timezone', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: pointsWithTimeSQL(50, '2018-01-01T00:00:00+00', '2018-12-31T23:59:59+00', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    month: {
                                        column: 'date',
                                        group: {
                                            units: 'month',
                                            timezone: '+7200'
                                        },
                                        format: 'iso'
                                    }
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
                    const resultMonths = tileJSON[0].features.map(f => f.properties.month).sort();
                    assert.deepStrictEqual(resultMonths, [
                        '2018-01', '2018-02', '2018-03', '2018-04', '2018-05', '2018-06',
                        '2018-07', '2018-08', '2018-09', '2018-10', '2018-11', '2018-12',
                        '2019-01'
                    ]);
                    done();
                });
            });

            it('aggregation dimension hour iso format with timezone', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            // take four points per hour over two days
                            sql: pointsWithTimeSQL(96, '2018-01-01T00:00:00+02', '2018-01-01T23:59:59+02', 0),
                            dates_as_numbers: true,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    hour: {
                                        column: 'date',
                                        group: {
                                            units: 'hour',
                                            timezone: '+7200'
                                        },
                                        format: 'iso'
                                    }
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
                    const resultHours = tileJSON[0].features.map(f => f.properties.hour).sort();
                    assert.deepStrictEqual(resultHours, [
                        '2018-01-01T00',
                        '2018-01-01T01',
                        '2018-01-01T02',
                        '2018-01-01T03',
                        '2018-01-01T04',
                        '2018-01-01T05',
                        '2018-01-01T06',
                        '2018-01-01T07',
                        '2018-01-01T08',
                        '2018-01-01T09',
                        '2018-01-01T10',
                        '2018-01-01T11',
                        '2018-01-01T12',
                        '2018-01-01T13',
                        '2018-01-01T14',
                        '2018-01-01T15',
                        '2018-01-01T16',
                        '2018-01-01T17',
                        '2018-01-01T18',
                        '2018-01-01T19',
                        '2018-01-01T20',
                        '2018-01-01T21',
                        '2018-01-01T22',
                        '2018-01-01T23'
                    ]);
                    tileJSON[0].features.forEach(f => assert.strictEqual(f.properties._cdb_feature_count, 4));
                    done();
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`dimensions should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    dimensions: {
                                        value: 'value'
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

                        tileJSON[0].features.forEach(
                            feature => assert.strictEqual(typeof feature.properties.value, 'number')
                        );

                        done();
                    });
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`dimensions with alias should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    dimensions: {
                                        value2: 'value'
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

                        tileJSON[0].features.forEach(
                            feature => assert.strictEqual(typeof feature.properties.value2, 'number')
                        );

                        done();
                    });
                });
            });

            it('dimensions should trigger non-default aggregation', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            aggregation: {
                                threshold: 1,
                                dimensions: {
                                    value: 'value'
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

                    tileJSON[0].features.forEach(
                        feature => assert.strictEqual(typeof feature.properties.value, 'number')
                    );
                    tileJSON[0].features.forEach(
                        feature => assert.strictEqual(typeof feature.properties.sqrt_value, 'undefined')
                    );

                    done();
                });
            });

            it('aggregation columns should trigger non-default aggregation', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_2,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
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

                    tileJSON[0].features.forEach(
                        feature => assert.strictEqual(typeof feature.properties.value, 'number')
                    );
                    tileJSON[0].features.forEach(
                        feature => assert.strictEqual(typeof feature.properties.sqrt_value, 'undefined')
                    );

                    done();
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`aggregations with base column names should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    columns: {
                                        value: {
                                            aggregate_function: 'sum',
                                            aggregated_column: 'value'
                                        }
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

                        tileJSON[0].features.forEach(
                            feature => assert.strictEqual(typeof feature.properties.value, 'number')
                        );

                        done();
                    });
                });
            });

            it('should work when the sql has single quotes', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: `
                            SELECT
                                cartodb_id,
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

                    assert.strictEqual(typeof body.metadata, 'object');
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

                    assert.strictEqual(typeof body.metadata, 'object');
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

                    assert.strictEqual(typeof body.metadata, 'object');
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

                    assert.strictEqual(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                    done();
                });
            });

            it('aggregates with full-sample placement by default', function (done) {
                this.mapConfig = createVectorMapConfig([
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

                this.testClient = new TestClient(this.mapConfig);

                this.testClient.getTile(0, 0, 0, { format: 'mvt' }, function (err, res, mvt) {
                    if (err) {
                        return done(err);
                    }

                    const geojsonTile = JSON.parse(mvt.toGeoJSONSync(0));

                    assert.ok(Array.isArray(geojsonTile.features));
                    assert.ok(geojsonTile.features.length > 0);

                    const feature = geojsonTile.features[0];

                    assert.ok(Object.prototype.hasOwnProperty.call(feature.properties, 'value'), 'Missing value property');

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
                                resolution: 'wadus'
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid resolution, should be a number greather than 0'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid resolution, should be a number greather than 0',
                            layer: {
                                id: 'wadus',
                                index: 0,
                                type: 'mapnik'
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
                                placement: 'wadus'
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid placement. Valid values: centroid, point-grid, point-sample'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid placement. Valid values: centroid, point-grid, point-sample',
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

            it('should fail with bad threshold', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 'wadus'
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid threshold, should be a number greather than 0'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid threshold, should be a number greather than 0',
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

            it('should fail with bad column name', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    '': {
                                        aggregate_function: 'count',
                                        aggregated_column: 'value'
                                    }
                                }
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid column name, should be a non empty string'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid column name, should be a non empty string',
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

            it('should fail with bad aggregated function', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    wadus_function: {
                                        aggregate_function: 'wadus',
                                        aggregated_column: 'value'
                                    }
                                }
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

                    assert.deepStrictEqual(body, {
                        errors: ['Unsupported aggregation function wadus, ' +
                                    'valid ones: count, avg, sum, min, max, mode'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Unsupported aggregation function wadus, ' +
                                    'valid ones: count, avg, sum, min, max, mode',
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

            it('should fail with bad aggregated columns', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                columns: {
                                    total_wadus: {
                                        aggregate_function: 'sum',
                                        aggregated_column: ''
                                    }
                                }
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid aggregated column, should be a non empty string'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid aggregated column, should be a non empty string',
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

            it('should skip aggregation w/o failing when is Vector Only MapConfig and layer has polygons',
                function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POLYGONS_SQL_1
                            }
                        }
                    ]);

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.mvt));
                        body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.png));

                        const options = {
                            format: 'mvt'
                        };

                        this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                            if (err) {
                                return done(err);
                            }

                            const tileJSON = tile.toJSON();

                            assert.strictEqual(tileJSON[0].features.length, 7);

                            done();
                        });
                    });
                });

            it('should skip aggregation for polygons (w/o failing) and aggregate when the layer has points',
                function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POLYGONS_SQL_1
                            }
                        },
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

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        assert.strictEqual(body.metadata.layers[0].meta.aggregation.mvt, false);
                        assert.strictEqual(body.metadata.layers[1].meta.aggregation.mvt, true);

                        const options = {
                            format: 'mvt'
                        };

                        this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                            if (err) {
                                return done(err);
                            }

                            const tileJSON = tile.toJSON();

                            assert.strictEqual(tileJSON[0].features.length, 7);

                            done();
                        });
                    });
                });

            ['centroid', 'point-sample', 'point-grid', 'default'].forEach(placement => {
                it(`cartodb_id should be present in ${placement} aggregation`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    threshold: 1,
                                    placement: placement !== 'default' ? placement : undefined
                                },
                                cartocss: '#layer { marker-width: 1; }',
                                cartocss_version: '2.3.0',
                                interactivity: ['cartodb_id']
                            }
                        }
                    ]);

                    this.testClient = new TestClient(this.mapConfig);
                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                        done();
                    });
                });

                it(`should only require the_geom_webmercator for ${placement} aggregation`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_ONLY_WEBMERCATOR,
                                aggregation: {
                                    threshold: 1,
                                    placement: placement !== 'default' ? placement : undefined
                                }
                            }
                        }
                    ]);
                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                        body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.png));

                        done();
                    });
                });

                it(`${placement} aggregation should work with attributes`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                cartocss: '#layer { marker-width: 7; }',
                                cartocss_version: '2.3.0',
                                aggregation: {
                                    threshold: 1
                                },
                                attributes: {
                                    id: 'cartodb_id',
                                    columns: [
                                        'value'
                                    ]
                                }
                            }
                        }
                    ]);
                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));

                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.mvt));
                        body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

                        done();
                    });
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`filters should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    columns: {
                                        value: {
                                            aggregate_function: 'mode',
                                            aggregated_column: 'value'
                                        }
                                    },
                                    filters: {
                                        value: {
                                            greater_than_or_equal_to: 0
                                        }
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

                        tileJSON[0].features.forEach(row => {
                            assert.ok(row.properties.value >= 0);
                        });

                        done();
                    });
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`multiple ORed filters should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_1,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    columns: {
                                        value: {
                                            aggregate_function: 'mode',
                                            aggregated_column: 'value'
                                        }
                                    },
                                    filters: {
                                        value: [
                                            { greater_than: 0 },
                                            { less_than: -2 }
                                        ]
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

                        tileJSON[0].features.forEach(row => {
                            assert.ok(row.properties.value > 0 || row.properties.value < -2);
                        });

                        done();
                    });
                });
            });

            ['centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`multiple ANDed filters should work for ${placement} placement`, function (done) {
                    this.mapConfig = createVectorMapConfig([
                        {
                            type: 'cartodb',
                            options: {
                                sql: POINTS_SQL_2,
                                aggregation: {
                                    placement: placement,
                                    threshold: 1,
                                    columns: {
                                        value: {
                                            aggregate_function: 'sum',
                                            aggregated_column: 'value'
                                        },
                                        value2: {
                                            aggregate_function: 'sum',
                                            aggregated_column: 'sqrt_value'
                                        }
                                    },
                                    filters: {
                                        value: { greater_than: 0 },
                                        value2: { less_than: 9 }
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

                        tileJSON[0].features.forEach(row => {
                            assert.ok(row.properties.value > 0 && row.properties.value2 < 9);
                        });

                        done();
                    });
                });
            });

            it('supports IN filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: { in: [1, 3] }
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value === 1 || row.properties.value === 3);
                    });

                    done();
                });
            });

            it('supports NOT IN filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: { not_in: [1, 3] }
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value !== 1 && row.properties.value !== 3);
                    });

                    done();
                });
            });

            it('supports EQUAL filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: [{ equal: 1 }, { equal: 3 }]
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value === 1 || row.properties.value === 3);
                    });

                    done();
                });
            });

            it('supports NOT EQUAL filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: { not_equal: 1 }
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value !== 1);
                    });

                    done();
                });
            });

            it('supports BETWEEN filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: {
                                        greater_than_or_equal_to: -1,
                                        less_than_or_equal_to: 2
                                    }
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value >= -1 || row.properties.value <= 2);
                    });

                    done();
                });
            });

            it('supports RANGE filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: {
                                        greater_than: -1,
                                        less_than_or_equal_to: 2
                                    }
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

                    tileJSON[0].features.forEach(row => {
                        assert.ok(row.properties.value > -1 || row.properties.value <= 2);
                    });

                    done();
                });
            });

            it('invalid filters cause errors', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: {
                                        not_a_valid_parameter: 0
                                    }
                                }
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid filter parameter name: not_a_valid_parameter'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid filter parameter name: not_a_valid_parameter',
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

            it('filters on invalid columns cause errors', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        type: 'cartodb',
                        options: {
                            sql: POINTS_SQL_1,
                            aggregation: {
                                threshold: 1,
                                columns: {
                                    value_sum: {
                                        aggregate_function: 'sum',
                                        aggregated_column: 'value'
                                    }
                                },
                                filters: {
                                    value: {
                                        not_a_valid_parameter: 0
                                    }
                                }
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

                    assert.deepStrictEqual(body, {
                        errors: ['Invalid filtered column: value'],
                        errors_with_context: [{
                            type: 'layer',
                            message: 'Invalid filtered column: value',
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

            ['default', 'centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`for ${placement} and no points between tiles has unique ids`, function (done) {
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_0,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getTile(1, 0, 1, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }

                        const tile1 = JSON.parse(mvt.toGeoJSONSync(0));

                        assert.ok(Array.isArray(tile1.features));
                        assert.ok(tile1.features.length > 0);

                        this.testClient.getTile(1, 1, 0, { format: 'mvt' }, (err, res, mvt) => {
                            if (err) {
                                return done(err);
                            }

                            const tile2 = JSON.parse(mvt.toGeoJSONSync(0));

                            assert.ok(Array.isArray(tile2.features));
                            assert.ok(tile2.features.length > 0);

                            const tile1Ids = tile1.features.map(f => f.properties.cartodb_id);
                            const tile2Ids = tile2.features.map(f => f.properties.cartodb_id);
                            const repeatedIds = tile1Ids.filter(id => tile2Ids.includes(id));

                            assert.strictEqual(repeatedIds.length, 0);

                            done();
                        });
                    });
                });
                it(`for ${placement} has unique ids save between tiles`, function (done) {
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_1,
                                    resolution: 1,
                                    aggregation: {
                                        threshold: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getTile(1, 0, 1, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }

                        const tile1 = JSON.parse(mvt.toGeoJSONSync(0));

                        assert.ok(Array.isArray(tile1.features));
                        assert.ok(tile1.features.length > 0);

                        this.testClient.getTile(1, 1, 0, { format: 'mvt' }, (err, res, mvt) => {
                            if (err) {
                                return done(err);
                            }

                            const tile2 = JSON.parse(mvt.toGeoJSONSync(0));

                            assert.ok(Array.isArray(tile2.features));
                            assert.ok(tile2.features.length > 0);

                            const tile1Ids = tile1.features.map(f => f.properties.cartodb_id);
                            const tile2Ids = tile2.features.map(f => f.properties.cartodb_id);
                            const repeatedIds = tile1Ids.filter(id => tile2Ids.includes(id));

                            // It is not guaranteed that features appear in a single tile:
                            // features on the border of tiles can appear in multiple tiles
                            if (repeatedIds.length > 0) {
                                repeatedIds.forEach(id => {
                                    const tile1Features = tile1.features.filter(f => f.properties.cartodb_id === id);
                                    const tile2Features = tile2.features.filter(f => f.properties.cartodb_id === id);
                                    // repetitions cannot occur inside a tile
                                    assert.strictEqual(tile1Features.length, 1);
                                    assert.strictEqual(tile2Features.length, 1);
                                    const feature1 = tile1Features[0];
                                    const feature2 = tile2Features[0];
                                    // features should be identical (geometry and properties)
                                    assert.deepStrictEqual(feature1.properties, feature2.properties);
                                    assert.deepStrictEqual(feature1.geometry, feature2.geometry);
                                    // and geometry should be on the border;
                                    // for the dataset and zoom 1, only point with cartodb_id=4 (0,0)
                                    assert.strictEqual(feature1.properties.cartodb_id, 4);
                                    assert.strictEqual(feature2.properties.cartodb_id, 4);
                                });
                            }
                            done();
                        });
                    });
                });

                it(`for ${placement} each aggr. cell is in a single tile`, function (done) {
                    const z = 1;
                    const resolution = 1;
                    const query = POINTS_SQL_GRID(z, resolution);
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: query,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: resolution,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    const c = Math.pow(2, z - 1) - 1; // center tile coordinates

                    this.testClient.getTile(z, c + 0, c + 0, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }
                        const tile00 = JSON.parse(mvt.toGeoJSONSync(0));
                        this.testClient.getTile(z, c + 0, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                            if (err) {
                                return done(err);
                            }
                            const tile01 = JSON.parse(mvt.toGeoJSONSync(0));
                            this.testClient.getTile(z, c + 1, c + 0, { format: 'mvt' }, (err, res, mvt) => {
                                if (err) {
                                    return done(err);
                                }
                                const tile10 = JSON.parse(mvt.toGeoJSONSync(0));
                                this.testClient.getTile(z, c + 1, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                                    if (err) {
                                        return done(err);
                                    }
                                    const tile11 = JSON.parse(mvt.toGeoJSONSync(0));

                                    // There needs to be 13 points
                                    const countFeatures = (tile) =>
                                        tile.features.map(f => f.properties)
                                            .map(f => f._cdb_feature_count)
                                            .reduce((a, b) => a + b, 0);

                                    const tile00Count = countFeatures(tile00);
                                    const tile10Count = countFeatures(tile10);
                                    const tile01Count = countFeatures(tile01);
                                    const tile11Count = countFeatures(tile11);
                                    assert.strictEqual(13, tile00Count + tile10Count + tile01Count + tile11Count);

                                    done();
                                });
                            });
                        });
                    });
                });

                it(`for ${placement} no partially aggregated cells`, function (done) {
                    // Use level 1 with resolution 2 tiles and buffersize 1 (half the cell size)
                    // Only the cells completely inside the buffer are aggregated
                    const z = 1;
                    const resolution = 2;
                    // space the test points by half the resolution:
                    const query = POINTS_SQL_GRID(z, resolution / 2);

                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 1 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: query,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: resolution,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    const c = Math.pow(2, z - 1) - 1; // center tile coordinates

                    this.testClient.getTile(z, c, c, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }
                        const tile00 = JSON.parse(mvt.toGeoJSONSync(0));
                        this.testClient.getTile(z, c, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                            if (err) {
                                return done(err);
                            }
                            const tile01 = JSON.parse(mvt.toGeoJSONSync(0));
                            this.testClient.getTile(z, c + 1, c, { format: 'mvt' }, (err, res, mvt) => {
                                if (err) {
                                    return done(err);
                                }
                                const tile10 = JSON.parse(mvt.toGeoJSONSync(0));
                                this.testClient.getTile(z, c + 1, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                                    if (err) {
                                        return done(err);
                                    }
                                    const tile11 = JSON.parse(mvt.toGeoJSONSync(0));

                                    const tile00Expected = [
                                        { cartodb_id: 4, _cdb_feature_count: 3 }
                                    ];
                                    const tile10Expected = [
                                        { cartodb_id: 5, _cdb_feature_count: 5 }
                                    ];
                                    const tile01Expected = [
                                        { cartodb_id: 1, _cdb_feature_count: 2 }
                                    ];
                                    const tile11Expected = [
                                        { cartodb_id: 2, _cdb_feature_count: 3 }
                                    ];
                                    const tile00Actual = tile00.features.map(f => f.properties);
                                    const tile10Actual = tile10.features.map(f => f.properties);
                                    const tile01Actual = tile01.features.map(f => f.properties);
                                    const tile11Actual = tile11.features.map(f => f.properties);
                                    const orderById = (a, b) => a.cartodb_id - b.cartodb_id;
                                    assert.deepStrictEqual(tile00Actual.sort(orderById), tile00Expected);
                                    assert.deepStrictEqual(tile10Actual.sort(orderById), tile10Expected);
                                    assert.deepStrictEqual(tile01Actual.sort(orderById), tile01Expected);
                                    assert.deepStrictEqual(tile11Actual.sort(orderById), tile11Expected);

                                    done();
                                });
                            });
                        });
                    });
                });

                it(`for ${placement} includes complete cells in buffer`, function (done) {
                    // use buffersize coincident with resolution, the buffer should include neighbour cells
                    const z = 2;
                    const resolution = 1;
                    const query = POINTS_SQL_GRID(z, resolution);

                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 1 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: query,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: resolution,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    const c = Math.pow(2, z - 1) - 1; // center tile coordinates

                    this.testClient.getTile(z, c, c, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }
                        const tile00 = JSON.parse(mvt.toGeoJSONSync(0));
                        this.testClient.getTile(z, c, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                            if (err) {
                                return done(err);
                            }
                            const tile01 = JSON.parse(mvt.toGeoJSONSync(0));
                            this.testClient.getTile(z, c + 1, c, { format: 'mvt' }, (err, res, mvt) => {
                                if (err) {
                                    return done(err);
                                }
                                const tile10 = JSON.parse(mvt.toGeoJSONSync(0));
                                this.testClient.getTile(z, c + 1, c + 1, { format: 'mvt' }, (err, res, mvt) => {
                                    if (err) {
                                        return done(err);
                                    }
                                    const tile11 = JSON.parse(mvt.toGeoJSONSync(0));

                                    // We check that if an id/cell is present in multiple tiles,
                                    // it always contains the same amount of features
                                    const tile00Actual = tile00.features.map(f => f.properties);
                                    const tile10Actual = tile10.features.map(f => f.properties);
                                    const tile01Actual = tile01.features.map(f => f.properties);
                                    const tile11Actual = tile11.features.map(f => f.properties);

                                    const allFeatures = [...tile00Actual, ...tile10Actual,
                                        ...tile01Actual, ...tile11Actual];
                                    for (let i = 0; i < allFeatures.length; i++) {
                                        for (let j = i + 1; j < allFeatures.length; j++) {
                                            const c1 = allFeatures[i];
                                            const c2 = allFeatures[j];
                                            if (c1.cartodb_id === c2.cartodb_id) {
                                                assert.strictEqual(c1._cdb_feature_count, c2._cdb_feature_count);
                                            }
                                        }
                                    }
                                    done();
                                });
                            });
                        });
                    });
                });

                it(`for ${placement} points aggregated into corner cluster`, function (done) {
                    // this test will fail due to !bbox! lack of accuracy if strict cell filtering is in place
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_CELL,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getTile(20, 1000000, 1000000, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }
                        const tile = JSON.parse(mvt.toGeoJSONSync(0));
                        assert.strictEqual(tile.features.length, 1);
                        assert.strictEqual(tile.features[0].properties._cdb_feature_count, 4);
                        if (placement === 'point-grid') {
                            // check geometry x = 18181005.874444414, y = -18181043.94366749
                            const expectedPoint = [163.322754576802, -83.3823797469878];
                            assert.deepStrictEqual(tile.features[0].geometry.coordinates, expectedPoint);
                        }
                        done();
                    });
                });

                it(`for ${placement} points aggregated into correct cluster`, function (done) {
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_CELL_INNER,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);

                    this.testClient.getTile(20, 1000000, 1000000, { format: 'mvt' }, (err, res, mvt) => {
                        if (err) {
                            return done(err);
                        }
                        const tile = JSON.parse(mvt.toGeoJSONSync(0));
                        assert.strictEqual(tile.features.length, 1);
                        assert.strictEqual(tile.features[0].properties._cdb_feature_count, 4);
                        if (placement === 'point-grid') {
                            // check geometry x = 18181006.023735486, y = -18181043.794376418
                            const expectedPoint = [163.322755917907, -83.3823795924354];
                            assert.deepStrictEqual(tile.features[0].geometry.coordinates, expectedPoint);
                        }
                        done();
                    });
                });
            });

            ['default', 'centroid', 'point-sample', 'point-grid'].forEach(placement => {
                it(`default pre-aggregation stats are available with ${placement} aggregation`, function (done) {
                    global.environment.enabledFeatures.layerStats = true;
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_PAIRS,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);
                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));
                        assert.ok(body.metadata.layers[0].meta.aggregation.mvt);
                        assert.ok(body.metadata.layers[0].meta.stats.estimatedFeatureCount > 0);

                        done();
                    });
                });

                it(`on demand post-aggregation stats are available with ${placement} aggregation`, function (done) {
                    global.environment.enabledFeatures.layerStats = true;
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_PAIRS,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    },
                                    metadata: {
                                        aggrFeatureCount: 10
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);
                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));
                        assert.ok(body.metadata.layers[0].meta.aggregation.mvt);
                        assert.strictEqual(body.metadata.layers[0].meta.stats.aggrFeatureCount, 13);

                        done();
                    });
                });

                it(`post-aggregation count adapts to zoom level with ${placement} aggregation`, function (done) {
                    global.environment.enabledFeatures.layerStats = true;
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_PAIRS,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    },
                                    metadata: {
                                        aggrFeatureCount: 0
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);
                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));
                        assert.ok(body.metadata.layers[0].meta.aggregation.mvt);
                        assert.strictEqual(body.metadata.layers[0].meta.stats.aggrFeatureCount, 7);

                        done();
                    });
                });

                it(`on-demand pre-aggregation stats are available with ${placement} aggregation`, function (done) {
                    global.environment.enabledFeatures.layerStats = true;
                    this.mapConfig = {
                        version: '1.6.0',
                        buffersize: { mvt: 0 },
                        layers: [
                            {
                                type: 'cartodb',

                                options: {
                                    sql: POINTS_SQL_PAIRS,
                                    aggregation: {
                                        threshold: 1,
                                        resolution: 1,
                                        placement: placement !== 'default' ? placement : undefined
                                    },
                                    metadata: {
                                        featureCount: true
                                    }
                                }
                            }
                        ]
                    };

                    this.testClient = new TestClient(this.mapConfig);
                    this.testClient.getLayergroup((err, body) => {
                        if (err) {
                            return done(err);
                        }

                        assert.strictEqual(typeof body.metadata, 'object');
                        assert.ok(Array.isArray(body.metadata.layers));
                        assert.ok(body.metadata.layers[0].meta.aggregation.mvt);
                        assert.strictEqual(body.metadata.layers[0].meta.stats.featureCount, 14);

                        done();
                    });
                });
            });
        });
    });
});
