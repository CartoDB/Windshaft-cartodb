'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const { parse: parseLayergroupToken } = require('../../lib/models/layergroup-token');

describe('layergroup id', function () {
    const suites = [
        {
            description: 'with empty layers should respond with cache buster equal to 0',
            expectedCacheBuster: '0',
            mapConfig: {
                version: '1.8.0',
                layers: []
            }
        },
        {
            description: 'with layer and dumb query (no affected tables) should respond with cache buster equal to 0',
            expectedCacheBuster: '0',
            mapConfig: {
                version: '1.8.0',
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: TestClient.SQL.ONE_POINT
                    }
                }]
            }
        },
        {
            description: 'with layer and legit query should respond with cache buster',
            expectedCacheBuster: '1234567890123',
            mapConfig: {
                version: '1.8.0',
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'SELECT * FROM test_table'
                    }
                }]
            }
        }
    ];

    suites.forEach(({ description, expectedCacheBuster, mapConfig }) => {
        it(description, function (done) {
            const testClient = new TestClient(mapConfig);

            testClient.getLayergroup((err, body) => {
                if (err) {
                    return done(err);
                }

                const { layergroupid } = body;
                assert.ok(typeof layergroupid === 'string');

                const { cacheBuster } = parseLayergroupToken(layergroupid);
                assert.strictEqual(cacheBuster, expectedCacheBuster);

                testClient.drain(done);
            });
        });
    });
});
