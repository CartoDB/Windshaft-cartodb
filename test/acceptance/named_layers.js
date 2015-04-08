var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);

var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/template_maps.js');

var Step = require('step');
var _ = require('underscore');

suite('named_layers', function() {
    // configure redis pool instance to use in tests
    var redisPool = RedisPool(global.environment.redis);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var wadusLayer = {
        type: 'cartodb',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { marker-fill: <%= color %>; }',
            cartocss_version: '2.3.0'
        }
    };

    var username = 'localhost';

    var templateName = 'valid_template';
    var template = {
        version: '0.0.1',
        name: templateName,
        auth: {
            method: 'open'
        },
        "placeholders": {
            "color": {
                "type": "css_color",
                "default": "#cc3300"
            }
        },
        layergroup: {
            layers: [
                wadusLayer
            ]
        }
    };

    var tokenAuthTemplateName = 'auth_valid_template';
    var tokenAuthTemplate = {
        version: '0.0.1',
        name: tokenAuthTemplateName,
        auth: {
            method: 'token',
            valid_tokens: ['valid1', 'valid2']
        },
        placeholders: {
            color: {
                "type": "css_color",
                "default": "#cc3300"
            }
        },
        layergroup: {
            layers: [
                wadusLayer
            ]
        }
    };


    var namedMapLayer = {
        type: 'named',
        options: {
            name: templateName,
            config: {},
            auth_tokens: []
        }
    };

    var nestedNamedMapTemplateName = 'nested_template';
    var nestedNamedMapTemplate = {
        version: '0.0.1',
        name: nestedNamedMapTemplateName,
        auth: {
            method: 'open'
        },
        layergroup: {
            layers: [
                namedMapLayer
            ]
        }
    };

    suiteSetup(function(done) {
        global.environment.enabledFeatures = {cdbQueryTablesFromPostgres: true};
        templateMaps.addTemplate(username, nestedNamedMapTemplate, function(err) {
            if (err) {
                return done(err);
            }
            templateMaps.addTemplate(username, tokenAuthTemplate, function(err) {
                if (err) {
                    return done(err);
                }
                templateMaps.addTemplate(username, template, function(err) {
                    return done(err);
                });
            });
        });
    });

    test('should fail for non-existing template name', function(done) {
        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: 'nonexistent'
                    }
                }
            ]
        };

        Step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 400
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.deepEqual(parsedBody, { errors: ["Template 'nonexistent' of user 'localhost' not found"] });

                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    });

    test('should return 403 if not properly authorized', function(done) {

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: tokenAuthTemplateName,
                        config: {},
                        auth_tokens: ['token1']
                    }
                }
            ]
        };

        Step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 403
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.deepEqual(
                    parsedBody,
                    { errors: [ "Unauthorized 'auth_valid_template' template instantiation" ] }
                );

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });

    test('should return 200 and layergroup if properly authorized', function(done) {

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: tokenAuthTemplateName,
                        config: {},
                        auth_tokens: ['valid1']
                    }
                }
            ]
        };

        Step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.ok(parsedBody.layergroupid);
                assert.ok(parsedBody.last_updated);

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });

    test('should return 400 for nested named map layers', function(done) {

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: nestedNamedMapTemplateName
                    }
                }
            ]
        };

        Step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 400
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.deepEqual(parsedBody, { errors: [ 'Nested named layers are not allowed' ] });

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });

    test('should return 200 and layergroup with private tables', function(done) {

        var privateTableTemplateName = 'private_table_template';
        var privateTableTemplate = {
            version: '0.0.1',
            name: privateTableTemplateName,
            auth: {
                method: 'open'
            },
            layergroup: {
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from test_table_private_1',
                            cartocss: '#layer { marker-fill: #cc3300; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        };

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: privateTableTemplateName
                    }
                }
            ]
        };

        Step(
            function createTemplate() {
                templateMaps.addTemplate(username, privateTableTemplate, this);
            },
            function createLayergroup(err) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.ok(parsedBody.layergroupid);
                assert.ok(parsedBody.last_updated);

                return parsedBody.layergroupid;
            },
            function requestTile(err, layergroupId) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/0/0/0.png',
                        method: 'GET',
                        headers: {
                            host: 'localhost'
                        },
                        encoding: 'binary'
                    },
                    {
                        status: 200,
                        headers: {
                            'content-type': 'image/png'
                        }
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function handleTileResponse(err, res) {
                if (err) {
                    throw err;
                }
                test_helper.checkCache(res);
                return true;
            },
            function deleteTemplate(err) {
                var next = this;
                templateMaps.delTemplate(username, privateTableTemplate, function(/*delErr*/) {
                    // ignore deletion error
                    next(err);
                });
            },
            function finish(err) {
                done(err);
            }
        );

    });

    test('should return 200 and layergroup with private tables and interactivity', function(done) {

        var privateTableTemplateNameInteractivity = 'private_table_template_interactivity';
        var privateTableTemplate = {
            "version": "0.0.1",
            "auth": {
                "method": "open"
            },
            "name": privateTableTemplateNameInteractivity,
            "layergroup": {
                "layers": [
                    {
                        "type": "cartodb",
                        "options": {
                            "attributes": {
                                "columns": [
                                    "name"
                                ],
                                "id": "cartodb_id"
                            },
                            "cartocss": "#layer { marker-fill: #cc3300; }",
                            "cartocss_version": "2.3.0",
                            "interactivity": "cartodb_id",
                            "sql": "select * from test_table_private_1"
                        }
                    }
                ]
            }
        };

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'named',
                    options: {
                        name: privateTableTemplateNameInteractivity
                    }
                }
            ]
        };

        Step(
            function createTemplate() {
                templateMaps.addTemplate(username, privateTableTemplate, this);
            },
            function createLayergroup(err) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.ok(parsedBody.layergroupid);
                assert.ok(parsedBody.last_updated);

                return parsedBody.layergroupid;
            },
            function requestTile(err, layergroupId) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/0/0/0.png',
                        method: 'GET',
                        headers: {
                            host: 'localhost'
                        },
                        encoding: 'binary'
                    },
                    {
                        status: 200,
                        headers: {
                            'content-type': 'image/png'
                        }
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function handleTileResponse(err, res) {
                if (err) {
                    throw err;
                }
                test_helper.checkCache(res);
                return true;
            },
            function deleteTemplate(err) {
                var next = this;
                templateMaps.delTemplate(username, privateTableTemplate, function(/*delErr*/) {
                    // ignore deletion error
                    next(err);
                });
            },
            function finish(err) {
                done(err);
            }
        );

    });

    test('should return 403 when private table is accessed from non named layer', function(done) {

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select * from test_table_private_1',
                        cartocss: '#layer { marker-fill: #cc3300; }',
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'named',
                    options: {
                        name: templateName
                    }
                }
            ]
        };

        Step(
            function createLayergroup() {
                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(layergroup)
                    },
                    {
                        status: 403
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function checkLayergroup(err, response) {
                if (err) {
                    throw err;
                }

                var parsedBody = JSON.parse(response.body);
                assert.ok(parsedBody.errors[0].match(/permission denied for relation test_table_private_1/));

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });


    suiteTeardown(function(done) {
        global.environment.enabledFeatures = {cdbQueryTablesFromPostgres: false};
        templateMaps.delTemplate(username, nestedNamedMapTemplateName, function(err) {
            if (err) {
                return done(err);
            }
            templateMaps.delTemplate(username, tokenAuthTemplateName, function(err) {
                if (err) {
                    return done(err);
                }
                templateMaps.delTemplate(username, templateName, function(err) {
                    return done(err);
                });
            });
        });
    });
});
