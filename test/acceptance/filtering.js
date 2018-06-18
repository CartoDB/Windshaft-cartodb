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

describe('pre-aggregation filters', function () {

    const POINTS_100 = `
        SELECT
            i AS cartodb_id,
            ST_SetSRID(ST_MakePoint(i, i/2), 4326) as the_geom,
            ST_Transform(ST_SetSRID(ST_MakePoint(i, i/2), 4326), 3857) AS the_geom_webmercator,
            i as value,
            i*10 as value2,
            100-i as value3,
            CASE WHEN (i % 2) = 0 THEN 'even' ELSE 'even' END AS parity
        FROM generate_series(1, 100) i
    `;

    function createVectorMapConfig (layerOptions) {
        const commonOptions = {};
        return {
            version: '1.6.0',
            layers: layerOptions.map(options => {
                return {
                    type: 'cartodb',
                    options: Object.assign({}, commonOptions, options)
                };
            })
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

            after(function (){
                serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            });

            afterEach(function (done) {
                this.testClient.drain(done);
                global.environment.enabledFeatures.layerStats = this.layerStatsConfig;
            });

            it('should not apply filters below threshold', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        sql: POINTS_100,
                        filter: {
                            type: 'less_than',
                            column: 'value',
                            value: 10
                        },
                        filter_threshold: 1000
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);
                const options = {
                    format: 'mvt'
                };
                this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                    assert.ifError(err);

                    const tileJSON = tile.toJSON();
                    assert.equal(tileJSON[0].features.length, 100);
                    done();
                });
            });

            it('should apply filters above threshold', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        sql: POINTS_100,
                        filter: {
                            type: 'less_than',
                            column: 'value',
                            value: 10
                        },
                        filter_threshold: 10
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);
                const options = {
                    format: 'mvt'
                };
                this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                    assert.ifError(err);

                    const tileJSON = tile.toJSON();
                    assert.equal(tileJSON[0].features.length, 9);
                    done();
                });
            });

            it('should apply filters without threshold', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        sql: POINTS_100,
                        filter: {
                            type: 'less_than',
                            column: 'value',
                            value: 10
                        }
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);
                const options = {
                    format: 'mvt'
                };
                this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                    assert.ifError(err);

                    const tileJSON = tile.toJSON();
                    assert.equal(tileJSON[0].features.length, 9);
                    // TO CHECK VALUES:
                    // tileJSON[0].features.forEach(row => assert.ok(row.properties.value ...));
                    done();
                });
            });

            it('should filter only layers with filters', function (done) {
                this.mapConfig = createVectorMapConfig([
                    {
                        sql: POINTS_100,
                    },
                    {
                        sql: POINTS_100,
                        filter: {
                            type: 'less_than',
                            column: 'value',
                            value: 10
                        }
                    }
                ]);
                this.testClient = new TestClient(this.mapConfig);
                const options = {
                    format: 'mvt'
                };
                this.testClient.getTile(0, 0, 0, options, (err, res, tile) => {
                    assert.ifError(err);

                    const tileJSON = tile.toJSON();
                    assert.equal(tileJSON[0].features.length, 100);
                    assert.equal(tileJSON[1].features.length, 9);
                    // TO CHECK VALUES:
                    // tileJSON[0].features.forEach(row => assert.ok(row.properties.value ...));
                    done();
                });
            });
        });

        // TODO:
        // filtering works correctly for various complex expressions, and for each single simple expression
        // filtering occurs before aggregation (e.g. if having aggr columns with name of base columns)
        // can be combined with post-aggregation filters
        // metadata shows if filters were applied
        // metadata stats are not affected by filters
        // filters should work with queries that use mapnik tokens
        // filters should work with sql_wrap (?)
    });
});
