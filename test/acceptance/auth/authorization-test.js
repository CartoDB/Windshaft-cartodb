'use strict';

require('../../support/test-helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');
const mapnik = require('@carto/mapnik');

const PERMISSION_DENIED_RESPONSE = {
    status: 403,
    headers: {
        'Content-Type': 'application/json; charset=utf-8'
    }
};

describe('authorization', function () {
    it('should create a layergroup with regular apikey token', function (done) {
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

            testClientGet.getTile(0, 0, 0, params, function (err, res, body) {
                assert.ifError(err);

                assert.ok(Object.prototype.hasOwnProperty.call(body, 'errors'));
                assert.strictEqual(body.errors.length, 1);
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

            assert.ok(Object.prototype.hasOwnProperty.call(layergroupResult, 'errors'));
            assert.strictEqual(layergroupResult.errors.length, 1);
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

            assert.strictEqual(res.statusCode, 200);
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
        const testClient = new TestClient(mapConfig); // no apikey provided, using default

        testClient.getLayergroup({ response: { status: 403 } }, function (err, layergroupResult) { // TODO 401
            assert.ifError(err);

            assert.ok(Object.prototype.hasOwnProperty.call(layergroupResult, 'errors'));
            assert.strictEqual(layergroupResult.errors.length, 1);
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

            assert.ok(Object.prototype.hasOwnProperty.call(layergroupResult, 'errors'));
            assert.strictEqual(layergroupResult.errors.length, 1);
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
                    id: 'HEAD1',
                    type: 'buffer',
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

    describe('Named maps', function () {
        describe('LIST Named maps', function () {
            it('should fail while listing named maps with a regular apikey token', function (done) {
                const apikeyToken = 'regular1';

                const testClient = new TestClient({}, apikeyToken);

                testClient.getNamedMapList({ response: { status: 403 } }, function (err, res, body) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 403);

                    assert.strictEqual(body.errors.length, 1);
                    assert.ok(body.errors[0].match(/Forbidden/), body.errors[0]);

                    testClient.drain(done);
                });
            });

            it('should fail while listing named maps with the default apikey token', function (done) {
                const apikeyToken = 'default_public';

                const testClient = new TestClient({}, apikeyToken);

                testClient.getNamedMapList({ response: { status: 403 } }, function (err, res, body) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 403);

                    assert.strictEqual(body.errors.length, 1);
                    assert.ok(body.errors[0].match(/Forbidden/), body.errors[0]);

                    testClient.drain(done);
                });
            });

            it('should fail while listing named maps with non-existent apikey token', function (done) {
                const apikeyToken = 'wadus-wadus';

                const testClient = new TestClient({}, apikeyToken);

                testClient.getNamedMapList({ response: { status: 401 } }, function (err, res, body) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 401);

                    assert.strictEqual(body.errors.length, 1);
                    assert.ok(body.errors[0].match(/Unauthorized/), body.errors[0]);

                    testClient.drain(done);
                });
            });

            it('should list named maps with master apikey token', function (done) {
                const apikeyToken = 1234;

                const testClient = new TestClient({}, apikeyToken);

                testClient.getNamedMapList({}, function (err, res, body) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 200);
                    assert.ok(Array.isArray(body.template_ids));

                    testClient.drain(done);
                });
            });
        });

        describe('CREATE Named Map', function () {
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
                            cartocss_version: '2.3.0'
                        }
                    }]
                }
            };

            it('should create and get a named map tile using the master apikey token', function (done) {
                const apikeyToken = 1234;

                const testClient = new TestClient(template, apikeyToken);

                testClient.getTile(0, 0, 0, function (err, res, tile) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 200);
                    assert.ok(tile instanceof mapnik.Image);

                    testClient.drain(done);
                });
            });

            it('should fail creating a named map using a regular apikey token', function (done) {
                const apikeyToken = 'regular1';

                const testClient = new TestClient(template, apikeyToken);

                testClient.createTemplate({ response: { status: 403 } }, function (err, res, response) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 403);

                    assert.strictEqual(response.errors.length, 1);
                    assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                    testClient.drain(done);
                });
            });

            it('should fail creating a named map using the default apikey token', function (done) {
                const apikeyToken = 'default_public';

                const testClient = new TestClient(template, apikeyToken);

                testClient.createTemplate({ response: { status: 403 } }, function (err, res, response) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 403);

                    assert.strictEqual(response.errors.length, 1);
                    assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                    testClient.drain(done);
                });
            });

            it('should fail creating a named map using a non-existent apikey token', function (done) {
                const apikeyToken = 'wadus-wadus';

                const testClient = new TestClient(template, apikeyToken);

                testClient.createTemplate({ response: { status: 401 } }, function (err, res, response) {
                    assert.ifError(err);

                    assert.strictEqual(res.statusCode, 401);

                    assert.strictEqual(response.errors.length, 1);
                    assert.ok(response.errors[0].match(/Unauthorized/), response.errors[0]);

                    testClient.drain(done);
                });
            });
        });

        describe('DELETE Named Map', function () {
            const templateBase = {
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
                            cartocss_version: '2.3.0'
                        }
                    }]
                }
            };

            it('should delete a named map using the master apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenDelete = 1234;

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-delete-master' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient(template, apikeyTokenDelete);
                    testClientDelete.deleteTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 204 }
                        },
                        function (err, res) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 204);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail deleting a named map using a regular apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenDelete = 'regular1';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-delete-regular' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenDelete);
                    testClientDelete.deleteTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail deleting a named map using the default apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenDelete = 'default_public';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-delete-default' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient(template, apikeyTokenDelete);
                    testClientDelete.deleteTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail deleting a named map using a non-existent apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenDelete = 'wadus';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-delete-wadus' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient(template, apikeyTokenDelete);
                    testClientDelete.deleteTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 401 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 401);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Unauthorized/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });
        });

        describe('GET Named Map', function () {
            const templateBase = {
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
                            cartocss_version: '2.3.0'
                        }
                    }]
                }
            };

            it('should get a named map using the master apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenGet = 1234;

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-get-master' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenGet);
                    testClientDelete.getTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 200 }
                        },
                        function (err, res) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 200);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail getting a named map using a regular apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenGet = 'regular1';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-get-regular' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientGet = new TestClient({}, apikeyTokenGet);
                    testClientGet.getTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientGet.drain(done);
                        }
                    );
                });
            });

            it('should fail getting a named map using the default apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenGet = 'default_public';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-get-default' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientGet = new TestClient(template, apikeyTokenGet);
                    testClientGet.getTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientGet.drain(done);
                        }
                    );
                });
            });

            it('should fail getting a named map using a non-existent apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenGet = 'wadus';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-get-wadus' });

                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientGet = new TestClient(template, apikeyTokenGet);
                    testClientGet.getTemplate(
                        {
                            templateId: template.template_id,
                            response: { status: 401 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 401);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Unauthorized/), response.errors[0]);

                            testClientGet.drain(done);
                        }
                    );
                });
            });
        });

        describe('UPDATE Named Map', function () {
            const templateBase = {
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
                            cartocss_version: '2.3.0'
                        }
                    }]
                }
            };

            it('should update a named map using the master apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenUpdate = 1234;

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-update-master' });
                const templateUpdate = Object.assign({}, template, { zoom: 3 });
                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenUpdate);
                    testClientDelete.updateTemplate(
                        {
                            templateId: template.template_id,
                            templateData: templateUpdate,
                            response: { status: 200 }
                        },
                        function (err, res) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 200);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail updating a named map using a regular apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenUpdate = 'regular1';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-update-regular' });
                const templateUpdate = Object.assign({}, template, { zoom: 3 });
                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenUpdate);
                    testClientDelete.updateTemplate(
                        {
                            templateId: template.template_id,
                            templateData: templateUpdate,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail updating a named map using the default apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenUpdate = 'default_public';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-update-default' });
                const templateUpdate = Object.assign({}, template, { zoom: 3 });
                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenUpdate);
                    testClientDelete.updateTemplate(
                        {
                            templateId: template.template_id,
                            templateData: templateUpdate,
                            response: { status: 403 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 403);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Forbidden/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });

            it('should fail updating a named map using a non-existent apikey token', function (done) {
                const apikeyTokenCreate = 1234;
                const apikeyTokenUpdate = 'wadus';

                const template = Object.assign({}, templateBase, { name: templateBase.name + '-update-wadus' });
                const templateUpdate = Object.assign({}, template, { zoom: 3 });
                const testClientCreate = new TestClient(template, apikeyTokenCreate);

                testClientCreate.createTemplate({}, function (err, res, template) {
                    assert.ifError(err);

                    const testClientDelete = new TestClient({}, apikeyTokenUpdate);
                    testClientDelete.updateTemplate(
                        {
                            templateId: template.template_id,
                            templateData: templateUpdate,
                            response: { status: 401 }
                        },
                        function (err, res, response) {
                            assert.ifError(err);

                            assert.strictEqual(res.statusCode, 401);

                            assert.strictEqual(response.errors.length, 1);
                            assert.ok(response.errors[0].match(/Unauthorized/), response.errors[0]);

                            testClientDelete.drain(done);
                        }
                    );
                });
            });
        });
    });
});
