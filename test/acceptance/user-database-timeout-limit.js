require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const timeoutErrorTilePath = `${process.cwd()}/assets/render-timeout-fallback.png`;

const pointSleepSql = `
    SELECT
        pg_sleep(0.3),
        'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

const validationPointSleepSql = `
    SELECT
        pg_sleep(0.3),
        ST_Transform('SRID=4326;POINT(-180 85.05112877)'::geometry, 3857) the_geom_webmercator,
        1 cartodb_id,
        2 val
`;

const createMapConfig = ({
    version = '1.6.0',
    type = 'cartodb',
    sql = pointSleepSql,
    cartocss = TestClient.CARTOCSS.POINTS,
    cartocss_version = '2.3.0',
    interactivity = 'cartodb_id',
    countBy = 'cartodb_id',
    attributes
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
            attributes,
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

const DATASOURCE_TIMEOUT_ERROR = {
    errors: ['You are over platform\'s limits. Please contact us to know more details'],
    errors_with_context: [{
        type: 'limit',
        subtype: 'datasource',
        message: 'You are over platform\'s limits. Please contact us to know more details'
    }]
};

describe('user database timeout limit', function () {
    describe('dataview', function () {
        beforeEach(function (done) {
            const mapconfig = createMapConfig();
            this.testClient = new TestClient(mapconfig, 1234);
            TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
        });

        afterEach(function (done) {
            TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                if (err) {
                    return done(err);
                }
                this.testClient.drain(done);
            });
        });

        it('layergroup creation works but dataview request fails due to statement timeout', function (done) {
            const params = {
                response: {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                }
            };

            this.testClient.getDataview('count', params, (err, timeoutError) => {
                assert.ifError(err);

                assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                done();
            });
        });
    });

    describe('raster', function () {
        describe('while validating in layergroup creation', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({ sql: validationPointSleepSql });
                this.testClient = new TestClient(mapconfig, 1234);
                TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
            });

            afterEach(function (done) {
                TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('fails due to statement timeout', function (done) {
                const expectedResponse = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                    assert.deepEqual(timeoutError, {
                        errors: [ 'You are over platform\'s limits. Please contact us to know more details' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'You are over platform\'s limits. Please contact us to know more details',
                            layer: { id: 'layer0', index: 0, type: 'mapnik' }
                        }]
                    });

                    done();
                });
            });
        });

        describe('fetching raster tiles', function () {
            describe('with user\'s timeout of 200 ms', function () {
                beforeEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
                });

                afterEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
                });

                describe('with onTileErrorStrategy ENABLED', function () {
                    let onTileErrorStrategy;

                    beforeEach(function (done) {
                        onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                        global.environment.enabledFeatures.onTileErrorStrategy = true;

                        const mapconfig = createMapConfig();
                        this.testClient = new TestClient(mapconfig, 1234);
                        const expectedResponse = {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        };

                        this.testClient.getLayergroup(expectedResponse, (err, res) => {
                            if (err) {
                                return done(err);
                            }

                            this.layergroupid = res.layergroupid;

                            done();
                        });
                    });

                    afterEach(function (done) {
                        global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                        this.testClient.drain(done);
                    });

                    it('"png" fails due to statement timeout', function (done) {
                        const params = {
                            layergroupid: this.layergroupid,
                            format: 'png',
                            layers: [ 0 ]
                        };

                        this.testClient.getTile(0, 0, 0, params, (err, res, tile) => {
                            assert.ifError(err);

                            assert.imageIsSimilarToFile(tile, timeoutErrorTilePath, 0.05, (err) => {
                                assert.ifError(err);
                                done();
                            });
                        });
                    });

                    it('"static png" fails due to statement timeout', function (done) {
                        const params = {
                            layergroupid: this.layergroupid,
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
                    let onTileErrorStrategy;

                    beforeEach(function (done) {
                        onTileErrorStrategy = global.environment.enabledFeatures.onTileErrorStrategy;
                        global.environment.enabledFeatures.onTileErrorStrategy = false;

                        const mapconfig = createMapConfig();
                        this.testClient = new TestClient(mapconfig, 1234);
                        const expectedResponse = {
                            status: 200,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        };

                        this.testClient.getLayergroup(expectedResponse, (err, res) => {
                            if (err) {
                                return done(err);
                            }

                            this.layergroupid = res.layergroupid;

                            done();
                        });
                    });

                    afterEach(function (done) {
                        global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategy;

                        this.testClient.drain(done);
                    });

                    it('"png" fails due to statement timeout', function (done) {
                        const params = {
                            layergroupid: this.layergroupid,
                            format: 'png',
                            layers: [ 0 ],
                            response: {
                                status: 429,
                                headers: {
                                    'Content-Type': 'application/json; charset=utf-8'
                                }
                            }
                        };

                        this.testClient.getTile(0, 0, 0, params, (err, res, timeoutError) => {
                            assert.ifError(err);

                            assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                            done();
                        });
                    });

                    it('"static png" fails due to statement timeout', function (done) {
                        const params = {
                            layergroupid: this.layergroupid,
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
                            }
                        };

                        this.testClient.getStaticCenter(params, (err, res, timeoutError) => {
                            assert.ifError(err);

                            assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                            done();
                        });
                    });
                });
            });
        });
    });

    describe('vector', function () {
        describe('while validating in layergroup creation', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({ sql: validationPointSleepSql });
                this.testClient = new TestClient(mapconfig, 1234);
                TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
            });

            afterEach(function (done) {
                TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('fails due to statement timeout', function (done) {
                const expectedResponse = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                    assert.deepEqual(timeoutError, {
                        errors: [ 'You are over platform\'s limits. Please contact us to know more details' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'You are over platform\'s limits. Please contact us to know more details',
                            layer: { id: 'layer0', index: 0, type: 'mapnik' }
                        }]
                    });

                    done();
                });
            });
        });

        describe('fetching vector tiles', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig();
                this.testClient = new TestClient(mapconfig, 1234);
                const expectedResponse = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, res) => {
                    if (err) {
                        return done(err);
                    }

                    this.layergroupid = res.layergroupid;

                    done();
                });
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            describe('with user\'s timeout of 200 ms', function () {
                beforeEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
                });

                afterEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
                });

                it('"mvt" fails due to statement timeout', function (done) {
                    const params = {
                        layergroupid: this.layergroupid,
                        format: 'mvt',
                        layers: [ 0 ],
                        response: {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        }
                    };

                    this.testClient.getTile(0, 0, 0, params, (err, res, timeoutError) => {
                        assert.ifError(err);

                        assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                        done();
                    });
                });
            });
        });
    });


    describe('interactivity', function () {
        describe('while validating in layergroup creation', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({ sql: validationPointSleepSql, interactivity: 'val' });
                this.testClient = new TestClient(mapconfig, 1234);
                TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
            });

            afterEach(function (done) {
                TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('fails due to statement timeout', function (done) {
                const expectedResponse = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                    assert.deepEqual(timeoutError, {
                        errors: [ 'You are over platform\'s limits. Please contact us to know more details' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'You are over platform\'s limits. Please contact us to know more details',
                            layer: { id: 'layer0', index: 0, type: 'mapnik' }
                        }]
                    });

                    done();
                });
            });
        });

        describe('fetching interactivity tiles', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({ interactivity: 'val' });
                this.testClient = new TestClient(mapconfig, 1234);
                const expectedResponse = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, res) => {
                    if (err) {
                        return done(err);
                    }

                    this.layergroupid = res.layergroupid;

                    done();
                });
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            describe('with user\'s timeout of 200 ms', function () {
                beforeEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
                });

                afterEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
                });

                it('"grid.json" fails due to statement timeout', function (done) {
                    const params = {
                        layergroupid: this.layergroupid,
                        format: 'grid.json',
                        layers: 'mapnik',
                        response: {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        }
                    };

                    this.testClient.getTile(0, 0, 0, params, (err, res, timeoutError) => {
                        assert.ifError(err);

                        assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                        done();
                    });
                });
            });
        });
    });

    describe('torque', function () {
        describe('while validating in layergroup creation', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({
                    type: 'torque',
                    cartocss: TestClient.CARTOCSS.TORQUE
                });
                this.testClient = new TestClient(mapconfig, 1234);
                TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
            });

            afterEach(function (done) {
                TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
                    if (err) {
                        return done(err);
                    }
                    this.testClient.drain(done);
                });
            });

            it('fails due to statement timeout', function (done) {
                const expectedResponse = {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                    assert.deepEqual(timeoutError, {
                        errors: [ 'You are over platform\'s limits. Please contact us to know more details' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'You are over platform\'s limits. Please contact us to know more details',
                            layer: { id: 'torque-layer0', index: 0, type: 'torque' }
                        }]
                    });

                    done();
                });
            });
        });

        describe('fetching torque tiles', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({
                    type: 'torque',
                    cartocss: TestClient.CARTOCSS.TORQUE
                });
                this.testClient = new TestClient(mapconfig, 1234);
                const expectedResponse = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, res) => {
                    if (err) {
                        return done(err);
                    }

                    this.layergroupid = res.layergroupid;

                    done();
                });
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            describe('with user\'s timeout of 200 ms', function () {
                beforeEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
                });

                afterEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
                });

                it('"torque.json" fails due to statement timeout', function (done) {
                    const params = {
                        layergroupid: this.layergroupid,
                        format: 'torque.json',
                        layers: [ 0 ],
                        response: {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        }
                    };

                    this.testClient.getTile(0, 0, 0, params, (err, res, timeoutError) => {
                        assert.ifError(err);

                        assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                        done();
                    });
                });

                it('".png" fails due to statement timeout', function (done) {
                    const params = {
                        layergroupid: this.layergroupid,
                        format: 'torque.png',
                        layers: [ 0 ],
                        response: {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        }
                    };

                    this.testClient.getTile(0, 0, 0, params, (err, res, attributes) => {
                        assert.ifError(err);

                        assert.deepEqual(attributes, DATASOURCE_TIMEOUT_ERROR);

                        done();
                    });
                });
            });
        });
    });

    describe('attributes:', function () {
        describe('while validating in map instatiation', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({
                    attributes: {
                        id: 'cartodb_id',
                        columns: [ 'val' ]
                    }
                });
                this.testClient = new TestClient(mapconfig, 1234);
                TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
            });

            afterEach(function (done) {
                TestClient.setUserDatabaseTimeoutLimit('localhost', 0, (err) => {
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

                this.testClient.getLayergroup(expectedResponse, (err, timeoutError) => {
                    assert.deepEqual(timeoutError, {
                        errors: [ 'You are over platform\'s limits. Please contact us to know more details' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'You are over platform\'s limits. Please contact us to know more details',
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

        describe('fetching by feature id', function () {
            beforeEach(function (done) {
                const mapconfig = createMapConfig({
                    attributes: {
                        id: 'cartodb_id',
                        columns: [ 'val' ]
                    }
                });

                this.testClient = new TestClient(mapconfig, 1234);

                const expectedResponse = {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                this.testClient.getLayergroup(expectedResponse, (err, res) => {
                    if (err) {
                        return done(err);
                    }

                    this.layergroupid = res.layergroupid;

                    done();
                });
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            describe('with user\'s timeout of 200 ms', function () {
                beforeEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 200, done);
                });

                afterEach(function (done) {
                    TestClient.setUserDatabaseTimeoutLimit('localhost', 0, done);
                });

                it('fails due to statement timeout', function (done) {
                    const params = {
                        layergroupid: this.layergroupid,
                        featureId: 1,
                        layer: 0,
                        response: {
                            status: 429,
                            headers: {
                                'Content-Type': 'application/json; charset=utf-8'
                            }
                        }
                    };

                    this.testClient.getAttributes(params, (err, res, timeoutError) => {
                        assert.ifError(err);

                        assert.deepEqual(timeoutError, DATASOURCE_TIMEOUT_ERROR);

                        done();
                    });
                });
            });
        });
    });
});
