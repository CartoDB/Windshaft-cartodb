require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const timeoutErrorTilePath = `${process.cwd()}/assets/render-timeout-fallback.png`;

const pointSleepSql = `
    SELECT
        pg_sleep(0.5),
        'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator,
        1 cartodb_id,
        2 value
`;

// during instatiation we validate tile 30/0/0, creating a point in that tile `pg_sleep` will throw a timeout
const validationPointSleepSql = `
    SELECT
        pg_sleep(1),
        ST_Transform('SRID=4326;POINT(-180 85.05112877)'::geometry, 3857) the_geom_webmercator,
        1 cartodb_id,
        2 value
`;

const createMapConfig = ({
    version = '1.6.0',
    type = 'cartodb',
    sql = pointSleepSql,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    interactivity = 'cartodb_id',
    countBy = 'cartodb_id',
    attributes = { id: 'cartodb_id', columns: ['value'] },
} = {}) => ({
    version,
    layers: [{
        type,
        options: {
            source: {
                id: 'a0'
            },
            cartocss,
            cartocss_version,
            interactivity,
            attributes
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

describe('user timeout limit', function () {
    describe('map instantiation', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig({ sql: validationPointSleepSql });
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
        });

        afterEach(function (done) {
            this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
        });

        it('layergroup creation fails due to statement timeout', function (done) {
            const expectedResponse = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                assert.ifError(err);

                assert.deepEqual(timeoutError, {
                    errors: ["Render timed out"],
                    errors_with_context: [{
                        type: "layer",
                        message: "Render timed out",
                        layer: {
                            id: "layer0",
                            index: 0,
                            type: "mapnik"
                        }
                    }]
                });

                done();
            });
        });
    });

    describe('user torque timeout limits', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig({
                type: 'torque',
                cartocss: TestClient.CARTOCSS.TORQUE
            });
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.setUserDatabaseTimeoutLimit('localhost', 50, done);
        });

        afterEach(function (done) {
            this.testClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
        });

        it('layergroup creation fails due to statement timeout', function (done) {
            const expectedResponse = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                assert.ifError(err);

                assert.deepEqual(timeoutError, {
                    errors: ["TorqueRenderer: canceling statement due to statement timeout"],
                    errors_with_context: [{
                        "type": "layer",
                        "message": "TorqueRenderer: canceling statement due to statement timeout",
                        "layer": { "id": "torque-layer0", "index": 0, "type": "torque" }
                    }]
                });

                done();
            });
        });
    });

    describe('dataview', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.setUserDatabaseTimeoutLimit('localhost', 50, done);
        });

        afterEach(function (done) {
            this.testClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
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


    describe('raster', function () {
        describe('with onTileErrorStrategy ENABLED', function () {
            let onTileErrorStrategy;

            beforeEach(function () {
                onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                global.environment.enabledFeatures.onTileErrorStrategy = true;
            });

            afterEach(function () {
                global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;
            });

            beforeEach(function (done) {
                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });


            it('layergroup creation works but tile request fails due to render timeout', function (done) {
                this.testClient.getTile(0, 0, 0, {}, (err, res, tile) => {
                    assert.ifError(err);

                    assert.imageIsSimilarToFile(tile, timeoutErrorTilePath, 0.05, (err) => {
                        assert.ifError(err);
                        done();
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

            beforeEach(function (done) {
                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            it('layergroup creation works even if render tile is slow', function (done) {
                var params = {
                    status: 400,
                    contentType: 'application/json; charset=utf-8'
                };

                this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                    assert.ifError(err);

                    assert.equal(tile.errors[0], 'Render timed out');
                    done();
                });
            });
        });
    });

    describe('vector', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('layergroup creation works but vector tile request fails due to render timeout', function (done) {
            const params = {
                format: 'mvt',
                status: 400
            };

            this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                assert.ifError(err);

                assert.deepEqual(tile, {
                    errors: ['Render timed out'],
                    errors_with_context: [{ type: 'unknown', message: 'Render timed out' }]
                });

                done();
            });
        });
    });

    describe('interativity', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('layergroup creation works but "grid.json" tile request fails due to render timeout', function (done) {
            const params = {
                layers: 'mapnik',
                format: 'grid.json',
                status: 400
            };

            this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                assert.ifError(err);

                assert.deepEqual(tile, {
                    errors: ['Render timed out'],
                    errors_with_context: [{ type: 'unknown', message: 'Render timed out' }]
                });

                done();
            });
        });
    });
});

