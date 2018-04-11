require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');
const  mapnik = require('windshaft').mapnik;

const PERMISSION_DENIED_RESPONSE = {
    status: 403,
    headers: {
        'Content-Type': 'application/json; charset=utf-8'
    }
};

describe('authorization', function() {
    it('should create a layergroup with regular apikey token', function(done) {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });

    it.skip('should create and get a named map tile using a regular apikey token', function (done) {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getTile(0, 0, 0, function (err, res, tile) {
            assert.ifError(err);

            assert.equal(res.statusCode, 200);
            assert.ok(tile instanceof mapnik.Image);

            testClient.drain(done);
        });
    });

    it('should fail getting a named map tile with default apikey token', function (done) {
        const apikeyTokenCreate = 'regular1';
        const apikeyTokenGet = 'default_public';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };

        const testClientCreate = new TestClient(mapConfig, apikeyTokenCreate);
        testClientCreate.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);
            const layergroupId = layergroupResult.layergroupid;

            const testClientGet = new TestClient({}, apikeyTokenGet);

            const params = {
                layergroupid: layergroupId,
                response: PERMISSION_DENIED_RESPONSE
            };

            testClientGet.getTile(0, 0, 0, params, function(err, res, body) {

                assert.ifError(err);

                assert.ok(body.hasOwnProperty('errors'));
                assert.equal(body.errors.length, 1);
                assert.ok(body.errors[0].match(/permission denied/), body.errors[0]);

                testClientGet.drain(done);
            });
        });
    });

    it('should fail creating a layergroup with default apikey token', function (done) {
        const apikeyToken = 'default_public';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup({ response: { status: 403 } }, function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.hasOwnProperty('errors'));
            assert.equal(layergroupResult.errors.length, 1);
            assert.ok(layergroupResult.errors[0].match(/permission denied/), layergroupResult.errors[0]);

            testClient.drain(done);
        });
    });

    it('should create a layergroup with default apikey token', function (done) {
        const apikeyToken = 'default_public';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });

    it('should create and get a tile with default apikey token', function (done) {
        const apikeyToken = 'default_public';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getTile(0, 0, 0, function (err, res, tile) {
            assert.ifError(err);

            assert.equal(res.statusCode, 200);
            assert.ok(tile instanceof mapnik.Image);

            testClient.drain(done);
        });
    });

    it('should fail if apikey does not grant access to table', function (done) {
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig); //no apikey provided, using default

        testClient.getLayergroup({ response: { status: 403 } }, function (err, layergroupResult) { //TODO 401
            assert.ifError(err);

            assert.ok(layergroupResult.hasOwnProperty('errors'));
            assert.equal(layergroupResult.errors.length, 1);
            assert.ok(layergroupResult.errors[0].match(/permission denied/), layergroupResult.errors[0]);

            testClient.drain(done);
        });
    });

    it('should forbide access to API if API key does not grant access', function (done) {
        const apikeyToken = 'regular2';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup({ response: { status: 403 } }, function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.hasOwnProperty('errors'));
            assert.equal(layergroupResult.errors.length, 1);
            assert.ok(layergroupResult.errors[0].match(/Forbidden/), layergroupResult.errors[0]);

            testClient.drain(done);
        });
    });

    it('should create a layergroup with a source analysis using a default apikey token', function (done) {
        const apikeyToken = 'default_public';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'HEAD'
                        },
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ],
            analyses: [
                {
                    id: 'HEAD',
                    type: 'source',
                    params: {
                        query: 'select * from populated_places_simple_reduced'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });

    it('should create a layergroup with a source analysis using a regular apikey token', function (done) {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'HEAD'
                        },
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ],
            analyses: [
                {
                    id: 'HEAD',
                    type: 'source',
                    params: {
                        query: 'select * from test_table_localhost_regular1'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });

    // Warning: TBA
    it('should create a layergroup with a buffer analysis using a regular apikey token', function (done) {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'HEAD1'
                        },
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ],
            analyses: [
                {
                    id: "HEAD1",
                    type: "buffer",
                    params: {
                        source: {
                            id: 'HEAD2',
                            type: 'source',
                            params: {
                                query: 'select * from test_table_localhost_regular1'
                            }
                        },
                        radius: 50000
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });
    describe('Listing named maps', function() {

        it('should fail while listing named maps with a regular apikey token', function (done) {
            const apikeyToken = 'regular1';

            const testClient = new TestClient({}, apikeyToken);

            testClient.getNamedMapList({ response: { status: 403 } }, function (err, res, body) {
                assert.ifError(err);

                assert.equal(res.statusCode, 403);

                assert.equal(body.errors.length, 1);
                assert.ok(body.errors[0].match(/Forbidden/), body.errors[0]);

                testClient.drain(done);
            });
        });

        it('should fail while listing named maps with the default apikey token', function (done) {
            const apikeyToken = 'default_public';

            const testClient = new TestClient({}, apikeyToken);

            testClient.getNamedMapList({ response: { status: 403 } }, function (err, res, body) {
                assert.ifError(err);

                assert.equal(res.statusCode, 403);

                assert.equal(body.errors.length, 1);
                assert.ok(body.errors[0].match(/Forbidden/), body.errors[0]);

                testClient.drain(done);
            });
        });

        it('should fail while listing named maps with non-existent apikey token', function (done) {
            const apikeyToken = 'wadus-wadus';

            const testClient = new TestClient({}, apikeyToken);

            testClient.getNamedMapList({ response: { status: 401 } }, function (err, res, body) {
                assert.ifError(err);

                assert.equal(res.statusCode, 401);

                assert.equal(body.errors.length, 1);
                assert.ok(body.errors[0].match(/Unauthorized/), body.errors[0]);

                testClient.drain(done);
            });
        });

        it('should list named maps with master apikey token', function (done) {
            const apikeyToken = 1234;

            const testClient = new TestClient({}, apikeyToken);

            testClient.getNamedMapList({}, function (err, res, body) {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);
                assert.ok(Array.isArray(body.template_ids));

                testClient.drain(done);
            });
        });
    });

    it.skip('should create and get a named map tile using a regular apikey token', function (done) {
        const apikeyToken = 'regular1';

        const template = {
            version: '0.0.1',
            name: 'auth-api-template',
            placeholders: {
                buffersize: {
                    type: 'number',
                    default: 0
                }
            },
            layergroup: {
                version: '1.7.0',
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'select * from test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0',
                    }
                }]
            }
        };

        const testClient = new TestClient(template, apikeyToken);

        testClient.getTile(0, 0, 0, function (err, res, tile) {
            assert.ifError(err);

            assert.equal(res.statusCode, 200);
            assert.ok(tile instanceof mapnik.Image);

            testClient.drain(done);
        });
    });

    it.skip('should fail creating a named map using a regular apikey token and a private table', function (done) {
        const apikeyToken = 'regular1';

        const template = {
            version: '0.0.1',
            name: 'auth-api-template-private',
            placeholders: {
                buffersize: {
                    type: 'number',
                    default: 0
                }
            },
            layergroup: {
                version: '1.7.0',
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'select * from populated_places_simple_reduced_private',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0',
                    }
                }]
            }
        };

        const testClient = new TestClient(template, apikeyToken);

        testClient.getTile(0, 0, 0, { response: PERMISSION_DENIED_RESPONSE }, function (err, res, body) {
            assert.ifError(err);

            assert.ok(body.hasOwnProperty('errors'));
            assert.equal(body.errors.length, 1);
            assert.ok(body.errors[0].match(/permission denied/), body.errors[0]);

            testClient.drain(done);
        });
    });
});
