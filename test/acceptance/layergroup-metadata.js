require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');

describe('layergroup metadata', function () {

    const usePgMvtRenderer = process.env.POSTGIS_VERSION >= '20400';
    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

    before(function () {
        serverOptions.renderer.mvt.usePostGIS = usePgMvtRenderer;
    });

    after(function () {
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    [1234, 'default_public', false].forEach(api_key => {
        it(`tiles base urls ${api_key ? `with api key: ${api_key}` : 'without api key'}`, function (done) {
            const mapConfig = {
                version: '1.7.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                        }
                    }
                ]
            };

            const host = `https://localhost.localhost.lan:${global.environment.port}`;

            const testClient = new TestClient(mapConfig, api_key);
            testClient.getLayergroup((err, body) => {
                if (err) {
                    return done(err);
                }

                let urlLayer = `${host}/api/v1/map/${body.layergroupid}/layer0/{z}/{x}/{y}.mvt`;
                let urlNoLayer = `${host}/api/v1/map/${body.layergroupid}/{z}/{x}/{y}.mvt`;

                if (api_key) {
                    urlLayer += `?api_key=${api_key}`;
                    urlNoLayer += `?api_key=${api_key}`;
                }

                assert.ok(body.layergroupid);
                assert.equal(body.metadata.layers[0].tilejson.vector.tiles[0], urlLayer);
                assert.equal(body.metadata.tilejson.vector.tiles[0], urlNoLayer);
                assert.equal(body.metadata.url.vector.urlTemplate, urlNoLayer);

                testClient.drain(done);
            });
        });
    });
});
