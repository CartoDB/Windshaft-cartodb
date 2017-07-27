require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const pointSleepSql = `
    SELECT
        pg_sleep(1),
        'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

const createMapConfig = ({
    version = '1.6.0',
    type = 'cartodb',
    sql = pointSleepSql,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    countBy = 'cartodb_id'
} = {}) => ({
    version,
    layers: [{
        type,
        options: {
            source: {
                id: 'a0'
            },
            cartocss,
            cartocss_version
        }
    }],
    analyses: [
        {
            id: 'a0',
            type: 'source',
            params: {
                query: sql
            }
        }
    ],
    dataviews: {
        count: {
            source: {
                id: 'a0'
            },
            type: 'formula',
            options: {
                column: countBy,
                operation: 'count'
            }
        }
    }
});

describe('user database timeout limit', function () {
    beforeEach(function (done) {
        TestClient.setUserDatabaseTimeoutLimit('localhost', 50, done);
    });

    afterEach(function (done) {
        TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
    });

    describe('dataview', function () {
        beforeEach(function () {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('layergroup creation works but dataview request fails due to statement timeout', function (done) {
            const params = {
                response: {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                }
            };

            this.testClient.getDataview('count', params, (err, dataview) => {
                assert.ifError(err);

                assert.deepEqual(dataview, {
                    errors: ['canceling statement due to statement timeout'],
                    errors_with_context: [{ type: 'unknown', message: 'canceling statement due to statement timeout' }]
                });

                done();
            });
        });
    });

    describe('torque', function () {
        beforeEach(function () {
            const mapconfig = createMapConfig({
                type: 'torque',
                cartocss: TestClient.CARTOCSS.TORQUE
            });
            this.testClient = new TestClient(mapconfig, 1234);
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('layergroup creation fails due to statement timeout', function (done) {
            const expectedResponse = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                assert.deepEqual(timeoutError, {
                    errors: ["TorqueRenderer: canceling statement due to statement timeout"],
                    errors_with_context: [{
                        type: "layer",
                        message: "TorqueRenderer: canceling statement due to statement timeout",
                        layer: { id: 'torque-layer0', index: 0, type: "torque" }
                    }]
                });

                done();
            });
        });
    });
});
