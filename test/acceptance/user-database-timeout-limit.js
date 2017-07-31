require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');

const pointSleepSql = `
    SELECT
        pg_sleep(0.3),
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

            this.testClient.getDataview('count', params, (err, dataview) => {
                assert.ifError(err);

                assert.deepEqual(dataview, {
                    errors: ['canceling statement due to statement timeout'],
                    errors_with_context: [{
                        type: 'limit',
                        subtype: 'datasource',
                        message: 'canceling statement due to statement timeout'
                    }]
                });

                done();
            });
        });
    });

    describe('torque:', function () {
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
                        errors: [ 'TorqueRenderer: canceling statement due to statement timeout' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'TorqueRenderer: canceling statement due to statement timeout',
                            layer: { id: 'torque-layer0', index: 0, type: 'torque' }
                        }]
                    });

                    done();
                });
            });
        });

        describe('fetching "torque.json" tile', function () {
            before(function (done) {
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

                it('fails due to statement timeout', function (done) {
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

                    this.testClient.getTile(0, 0, 0, params, (err, res, attributes) => {
                        assert.ifError(err);

                        assert.deepEqual(attributes, {
                            errors: [ 'TorqueRenderer: canceling statement due to statement timeout' ],
                            errors_with_context: [{
                                type: 'limit',
                                subtype: 'datasource',
                                message: 'TorqueRenderer: canceling statement due to statement timeout',
                            }]
                        });

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
                        errors: [ 'canceling statement due to statement timeout' ],
                        errors_with_context: [{
                            type: 'limit',
                            subtype: 'datasource',
                            message: 'canceling statement due to statement timeout',
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

                    this.testClient.getAttributes(params, (err, res, attributes) => {
                        assert.ifError(err);

                        assert.deepEqual(attributes, {
                            errors: ['canceling statement due to statement timeout'],
                            errors_with_context: [{
                                type: 'limit',
                                subtype: 'datasource',
                                message: 'canceling statement due to statement timeout'
                            }]
                        });

                        done();
                    });
                });
            });
        });
    });
});
