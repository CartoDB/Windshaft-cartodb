'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/server-options');

describe('layergroup metadata', function () {
    const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

    before(function () {
        serverOptions.renderer.mvt.usePostGIS = true;
    });

    after(function () {
        serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
    });

    [1234, 'default_public', false].forEach(apiKey => {
        it(`tiles base urls ${apiKey ? `with api key: ${apiKey}` : 'without api key'}`, function (done) {
            const mapConfig = {
                version: '1.7.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from populated_places_simple_reduced'
                        }
                    }
                ]
            };

            const host = `https://localhost.localhost.lan:${global.environment.port}`;

            const testClient = new TestClient(mapConfig, apiKey);
            testClient.getLayergroup((err, body) => {
                if (err) {
                    return done(err);
                }

                let urlLayer = `${host}/api/v1/map/${body.layergroupid}/layer0/{z}/{x}/{y}.mvt`;
                let urlNoLayer = `${host}/api/v1/map/${body.layergroupid}/{z}/{x}/{y}.mvt`;

                if (apiKey) {
                    urlLayer += `?api_key=${apiKey}`;
                    urlNoLayer += `?api_key=${apiKey}`;
                }

                assert.ok(body.layergroupid);
                assert.strictEqual(body.metadata.layers[0].tilejson.vector.tiles[0], urlLayer);
                assert.strictEqual(body.metadata.tilejson.vector.tiles[0], urlNoLayer);
                assert.strictEqual(body.metadata.url.vector.urlTemplate, urlNoLayer);

                testClient.drain(done);
            });
        });
    });
});
