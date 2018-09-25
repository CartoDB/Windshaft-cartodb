require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');

describe('default raster aggregation', function () {
    const POINTS_SQL_1 = `
        select
            x + 4 as cartodb_id,
            st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
            st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
            x as value
        from generate_series(-3, 3) x
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

    const CARTOCSS_POINTS = TestClient.CARTOCSS.POINTS;

    function createMapConfig (layers = [
        {
            type: 'cartodb',
            options: {
                sql: POINTS_SQL_1,
                cartocss: CARTOCSS_POINTS,
                cartocss_version: '2.3.0'
            }
        },
        {
            type: 'cartodb',
            options: {
                sql: POINTS_SQL_2,
                cartocss: CARTOCSS_POINTS,
                cartocss_version: '2.3.0'
            }
        }
    ]) {
        return {
            version: '1.8.0',
            layers: layers
        };
    }

    const originalAggregation = serverOptions.aggregation;

    before(function () {
        serverOptions.aggregation = {
            enabled: true,
            threshold: {
                raster: 1,
                vector: 1e5
            }
        };

        this.layerStatsConfig = global.environment.enabledFeatures.layerStats;
    });

    after(function (){
        serverOptions.aggregation = originalAggregation;
    });

    afterEach(function (done) {
        this.testClient.drain(done);
    });


    it('should return a layergroup indicating the mapconfig was aggregated', function (done) {
        this.mapConfig = createMapConfig();
        this.testClient = new TestClient(this.mapConfig);
        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.equal(typeof body.metadata, 'object');
            assert.ok(Array.isArray(body.metadata.layers));

            body.metadata.layers.forEach(layer => assert.ok(!layer.meta.aggregation.mvt));
            body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.png));

            done();
        });
    });
});
