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
        st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
        x as value
    from generate_series(-3, 3) x
    `;

    const POINTS_SQL_2 = `
    select
        st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326) as the_geom,
        st_transform(st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326), 3857) as the_geom_webmercator,
        x as value
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


            beforeEach(function () {
                this.mapConfig = createVectorMapConfig();
                this.testClient = new TestClient(this.mapConfig);
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            it('should return a layergroup indicating that was aggregated', function (done) {
                this.testClient.getLayergroup((err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(typeof body.metadata, 'object');
                    assert.ok(Array.isArray(body.metadata.layers));

                    body.metadata.layers.forEach(layer => assert.ok(layer.meta.aggregation.aggregated));

                    done();
                });
            });
        });
    });
});
