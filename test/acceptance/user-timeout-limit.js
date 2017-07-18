require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const timeoutErrorTilePath = `${process.cwd()}/assets/render-timeout-fallback.png`;

var pointSleepSql = `
    SELECT
        pg_sleep(0.5),
        'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator,
        1 cartodb_id
`;

function createMapConfig (sql = pointSleepSql, cartocss = TestClient.CARTOCSS.POINTS) {
    return {
        version: '1.6.0',
        layers: [{
            type: 'cartodb',
            options: {
                sql,
                cartocss,
                cartocss_version: '2.3.0',
                interactivity: 'cartodb_id'
            }
        }]
    };
}

describe('user timeout limits', function () {
    describe('with onTileErrorStrategy ENABLED', function () {
        let onTileErrorStrategy;

        before(function () {
            onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
            global.environment.enabledFeatures.onTileErrorStrategy = true;
        });

        after(function () {
            global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;
        });

        it('layergroup creation works if test tile is fast but tile request fails if they are slow', function (done) {
            var testClient = new TestClient(createMapConfig(), 1234);

            testClient.setUserRenderTimeoutLimit('localhost', 50, function (err) {
                assert.ifError(err);

                testClient.getTile(0, 0, 0, {}, function (err, res, tile) {
                    assert.ifError(err);

                    assert.imageIsSimilarToFile(tile, timeoutErrorTilePath, 0.05, function (err) {
                        assert.ifError(err);
                        testClient.drain(done);
                    });
                });
            });
        });
    });

    describe('with onTileErrorStrategy DISABLED', function() {
        var onTileErrorStrategy;

        beforeEach(function() {
            onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
            global.environment.enabledFeatures.onTileErrorStrategy = false;
        });

        afterEach(function() {
            global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;
        });

        it('layergroup creation works even if test tile is slow', function (done) {
            var testClient = new TestClient(createMapConfig(), 1234);
            testClient.setUserRenderTimeoutLimit('localhost', 50, function (err) {
                assert.ifError(err);
                var params = {
                    status: 400,
                    contentType: 'application/json; charset=utf-8'
                };

                testClient.getTile(0, 0, 0, params, function (err, res, tile) {
                    assert.ifError(err);

                    assert.equal(tile.errors[0], 'Render timed out');
                    testClient.drain(done);
                });
            });
        });
    });
});
