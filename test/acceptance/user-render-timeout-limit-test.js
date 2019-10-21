'use strict';

require('../support/test-helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
var serverOptions = require('../../lib/server-options');

const timeoutErrorTilePath = `${process.cwd()}/assets/render-timeout-fallback.png`;

const pointSleepSql = `
    SELECT
        pg_sleep(0.5),
        'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

// during instatiation we validate tile 30/0/0, creating a point in that tile `pg_sleep` will throw a timeout
const validationPointSleepSql = `
    SELECT
        pg_sleep(0.5),
        ST_Transform('SRID=4326;POINT(-180 85.05112877)'::geometry, 3857) the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

const renderTimeoutErrorMessage = 'You are over platform\'s limits: Render timeout error.' +
    ' Contact CARTO support for more details.';

const createMapConfig = ({
    version = '1.6.0',
    type = 'cartodb',
    sql = pointSleepSql,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    interactivity = 'cartodb_id',
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
            cartocss_version,
            interactivity
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

describe('user render timeout limit', function () {
    describe('map instantiation => validation', function () {
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
                status: 429,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            this.testClient.getLayergroup({ response: expectedResponse }, (err, timeoutError) => {
                assert.ifError(err);

                assert.deepStrictEqual(timeoutError, {
                    errors: [renderTimeoutErrorMessage],
                    errors_with_context: [{
                        type: 'limit',
                        subtype: 'render',
                        message: renderTimeoutErrorMessage,
                        layer: {
                            id: 'layer0',
                            index: 0,
                            type: 'mapnik'
                        }
                    }]
                });

                done();
            });
        });
    });

    describe('raster', function () {
        describe('with onTileErrorStrategy ENABLED', function () {
            let onTileErrorStrategy;

            beforeEach(function (done) {
                onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                global.environment.enabledFeatures.onTileErrorStrategy = true;

                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                    if (err) {
                        return done(err);
                    }
                    this.layergroup = layergroup;
                    this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
                });
            });

            afterEach(function (done) {
                global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('layergroup creation works but tile request fails due to render timeout', function (done) {
                const params = {
                    layergroupid: this.layergroup.layergroupid,
                    cacheBuster: true
                };

                this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                    assert.ifError(err);

                    assert.imageIsSimilarToFile(tile, timeoutErrorTilePath, 0.05, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        });

        describe('with onTileErrorStrategy DISABLED', function () {
            var onTileErrorStrategy;

            beforeEach(function (done) {
                onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                global.environment.enabledFeatures.onTileErrorStrategy = false;

                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                    if (err) {
                        return done(err);
                    }
                    this.layergroup = layergroup;
                    this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
                });
            });

            afterEach(function (done) {
                global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('layergroup creation works and render tile fails', function (done) {
                var params = {
                    layergroupid: this.layergroup.layergroupid,
                    response: {
                        status: 429,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    },
                    cacheBuster: true
                };

                this.testClient.getTile(0, 0, 0, params, (err, res, timeoutError) => {
                    assert.ifError(err);

                    assert.deepStrictEqual(timeoutError, {
                        errors: [renderTimeoutErrorMessage],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'render',
                            message: renderTimeoutErrorMessage
                        }]
                    });

                    done();
                });
            });
        });
    });

    describe('vector tile via mapnik renderer', function () {
        const usePostGIS = false;
        const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

        beforeEach(function (done) {
            serverOptions.renderer.mvt.usePostGIS = usePostGIS;
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                if (err) {
                    return done(err);
                }
                this.layergroup = layergroup;
                this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
            });
        });

        afterEach(function (done) {
            serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
            this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
        });

        it('layergroup creation works but vector tile request fails due to render timeout', function (done) {
            const params = {
                layergroupid: this.layergroup.layergroupid,
                format: 'mvt',
                response: {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/x-protobuf'
                    }
                },
                cacheBuster: true
            };

            this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                assert.ifError(err);

                var tileJSON = tile.toJSON();
                assert.strictEqual(Array.isArray(tileJSON), true);
                assert.strictEqual(tileJSON.length, 2);
                assert.strictEqual(tileJSON[0].name, 'errorTileSquareLayer');
                assert.strictEqual(tileJSON[1].name, 'errorTileStripesLayer');

                done();
            });
        });
    });

    describe('interativity', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                if (err) {
                    return done(err);
                }
                this.layergroup = layergroup;
                this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
            });
        });

        afterEach(function (done) {
            this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
        });

        it('layergroup creation works but "grid.json" tile request fails due to render timeout', function (done) {
            const params = {
                layergroupid: this.layergroup.layergroupid,
                layers: 'mapnik',
                format: 'grid.json',
                response: {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                },
                cacheBuster: true
            };

            this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                assert.ifError(err);

                assert.deepStrictEqual(tile, {
                    errors: [renderTimeoutErrorMessage],
                    errors_with_context: [{
                        type: 'limit',
                        subtype: 'render',
                        message: renderTimeoutErrorMessage
                    }]
                });

                done();
            });
        });
    });

    describe('static images', function () {
        describe('with onTileErrorStrategy ENABLED', function () {
            let onTileErrorStrategy;

            beforeEach(function (done) {
                onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                global.environment.enabledFeatures.onTileErrorStrategy = true;

                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                    if (err) {
                        return done(err);
                    }
                    this.layergroup = layergroup;
                    this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
                });
            });

            afterEach(function (done) {
                global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('layergroup creation works but static image fails due to render timeout', function (done) {
                const params = {
                    layergroupid: this.layergroup.layergroupid,
                    zoom: 0,
                    lat: 0,
                    lng: 0,
                    width: 256,
                    height: 256,
                    format: 'png'
                };

                this.testClient.getStaticCenter(params, function (err, res, tile) {
                    assert.ifError(err);

                    assert.imageIsSimilarToFile(tile, timeoutErrorTilePath, 0.05, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        });

        describe('with onTileErrorStrategy DISABLED', function () {
            var onTileErrorStrategy;

            beforeEach(function (done) {
                onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                global.environment.enabledFeatures.onTileErrorStrategy = false;

                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                this.testClient.getLayergroup(mapconfig, (err, layergroup) => {
                    if (err) {
                        return done(err);
                    }
                    this.layergroup = layergroup;
                    this.testClient.setUserRenderTimeoutLimit('localhost', 50, done);
                });
            });

            afterEach(function (done) {
                global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                this.testClient.setUserRenderTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('layergroup creation works and render static center tile fails', function (done) {
                const params = {
                    layergroupid: this.layergroup.layergroupid,
                    zoom: 0,
                    lat: 0,
                    lng: 0,
                    width: 256,
                    height: 256,
                    format: 'png',
                    response: {
                        status: 429,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    },
                    cacheBuster: true
                };

                this.testClient.getStaticCenter(params, function (err, res, timeoutError) {
                    assert.ifError(err);

                    assert.deepStrictEqual(timeoutError, {
                        errors: [renderTimeoutErrorMessage],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'render',
                            message: renderTimeoutErrorMessage
                        }]
                    });

                    done();
                });
            });
        });
    });
});
