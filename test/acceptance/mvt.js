require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

function createMapConfig (sql = TestClient.SQL.ONE_POINT) {
    return {
        version: '1.6.0',
        layers: [{
            type: "cartodb",
            options: {
                sql: sql,
                cartocss: TestClient.CARTOCSS.POINTS,
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            }
        }]
    };
}

describe('mvt', function () {
    const testCases = [
        {
            desc: 'should get empty mvt with code 204 (no content)',
            coords: { z: 0, x: 0, y: 0 },
            format: 'mvt',
            status: 204,
            mapConfig: createMapConfig(TestClient.SQL.EMPTY)
        },
        {
            desc: 'should get mvt tile with code 200 (ok)',
            coords: { z: 0, x: 0, y: 0 },
            format: 'mvt',
            status: 200,
            mapConfig: createMapConfig()
        }
    ];

    testCases.forEach(function (test) {
        it(test.desc, done => {
            const testClient = new TestClient(test.mapConfig, 1234);
            const { z, x, y } = test.coords;
            const { format, status } = test;

            testClient.getTile(z, x, y, { format, status }, (err, res) => {
                assert.ifError(err);

                assert.equal(res.statusCode, test.status);
                testClient.drain(done);
            });
        });
    });
});