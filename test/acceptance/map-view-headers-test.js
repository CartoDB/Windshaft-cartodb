'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const defaultLayers = [{
    type: 'cartodb',
    options: {
        sql: TestClient.SQL.ONE_POINT
    }
}];
const defaultStatTag = 'wadus';

function createMapConfig (layers = defaultLayers, statTag = defaultStatTag) {
    return {
        version: '1.8.0',
        layers: layers,
        stat_tag: defaultStatTag
    };
}

describe('map view headers', function () {
    it('anonymous map instantiation should respond with map-view headers', function (done) {
        const mapConfig = createMapConfig();
        const testClient = new TestClient(mapConfig);
        const params = { client: 'test' };

        testClient.getLayergroup(params, (err, body, res) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(res.headers['carto-stat-tag'], defaultStatTag);
            assert.strictEqual(res.headers['carto-client'], params.client);
            assert.strictEqual(res.headers['carto-user-id'], '1');

            testClient.drain(done);
        });
    });

    it('named map instantiation should respond with map-view headers', function (done) {
        const templateid = `map-view-headers-test-${Date.now()}`;
        const template = {
            version: '0.0.1',
            name: templateid,
            layergroup: createMapConfig()
        };

        const testClient = new TestClient(template, 1234);
        const params = { client: 'test' };

        testClient.getLayergroup(params, (err, body, res) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(res.headers['carto-stat-tag'], defaultStatTag);
            assert.strictEqual(res.headers['carto-client'], params.client);
            assert.strictEqual(res.headers['carto-user-id'], '1');

            testClient.drain(done);
        });
    });

    it('preview should respond with map-view headers', function (done) {
        const templateid = `map-view-headers-test-${Date.now()}`;
        const template = {
            version: '0.0.1',
            name: templateid,
            layergroup: createMapConfig([{
                type: 'cartodb',
                options: {
                    sql: TestClient.SQL.ONE_POINT,
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }])
        };

        const testClient = new TestClient(template, 1234);
        const params = { client: 'test' };

        testClient.getPreview(640, 480, params, (err, res) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(res.headers['carto-stat-tag'], defaultStatTag);
            assert.strictEqual(res.headers['carto-client'], params.client);
            assert.strictEqual(res.headers['carto-user-id'], '1');

            testClient.drain(done);
        });
    });
});
