require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');

function createMapConfig (sql) {
    sql = sql || [
        'select',
        '   *',
        'from',
        '   populated_places_simple_reduced',
    ].join('\n');

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
            mapConfig: createMapConfig('select 1 as cartodb_id, null::geometry as the_geom_webmercator')
        }
    ];

    testCases.forEach(function (test) {
        it(test.desc, done => {
            const testClient = new TestClient(test.mapConfig, 1234);
            const { z, x, y } = test.coords;
            const options = {
                format: test.format,
                status: 204
            };

            testClient.getTile(z, x, y, options, (err, res) => {
                assert.ifError(err);

                assert.ifError(err);
                assert.equal(res.statusCode, 204);
                assert.equal(res.body, '');
                testClient.drain(done);
            });
        });
    });
});