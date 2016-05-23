var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../support/layergroup-token');

var RedisPool = require('redis-mpool');
var TemplateMaps = require('../../lib/cartodb/backends/template_maps.js');

var step = require('step');

describe('named_layers', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

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
                wadusLayer,
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

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        test_helper.deleteRedisKeys(keysToDelete, done);
    });

    beforeEach(function(done) {
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

    afterEach(function(done) {
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

    it('should fail for non-existing template name', function(done) {
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

        step(
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

    it('should return 403 if not properly authorized', function(done) {

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

        step(
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

    it('should return 200 and layergroup if properly authorized', function(done) {

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

        step(
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

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });

    it('should return 400 for nested named map layers', function(done) {

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

        step(
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

    it('should return 200 and layergroup with private tables', function(done) {

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

        step(
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

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

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
                templateMaps.delTemplate(username, privateTableTemplateName, function(/*delErr*/) {
                    // ignore deletion error
                    next(err);
                });
            },
            function finish(err) {
                done(err);
            }
        );

    });

    it('should return 200 and layergroup with private tables and interactivity', function(done) {

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

        step(
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

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

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
                templateMaps.delTemplate(username, privateTableTemplateNameInteractivity, function(/*delErr*/) {
                    // ignore deletion error
                    next(err);
                });
            },
            function finish(err) {
                done(err);
            }
        );

    });

    it('should return 403 when private table is accessed from non named layer', function(done) {

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

        step(
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

    it('should return metadata for named layers', function(done) {

        var layergroup =  {
            version: '1.3.0',
            layers: [
                {
                    type: 'plain',
                    options: {
                        color: '#fabada'
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select * from test_table',
                        cartocss: '#layer { marker-fill: #cc3300; }',
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'named',
                    options: {
                        name: templateName
                    }
                },
                {
                    type: 'torque',
                    options: {
                        sql: "select * from test_table LIMIT 0",
                        cartocss: "Map { -torque-frame-count:1; -torque-resolution:1; " +
                        "-torque-aggregation-function:'count(*)'; -torque-time-attribute:'updated_at'; }"
                    }
                }
            ]
        };

        step(
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
                assert.ok(parsedBody.metadata);
                assert.ok(parsedBody.metadata.layers);
                assert.equal(parsedBody.metadata.layers.length, 5);
                assert.equal(parsedBody.metadata.layers[0].type, 'plain');
                assert.equal(parsedBody.metadata.layers[1].type, 'mapnik');
                assert.equal(parsedBody.metadata.layers[2].type, 'mapnik');
                assert.equal(parsedBody.metadata.layers[3].type, 'mapnik');
                assert.equal(parsedBody.metadata.layers[4].type, 'torque');

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                return null;
            },
            function finish(err) {
                done(err);
            }
        );

    });

    it('should work with named tiles', function(done) {

        var namedTilesTemplateName = 'named_tiles_template';
        var namedTilesTemplate = {
            version: '0.0.1',
            name: namedTilesTemplateName,
            auth: {
                method: 'open'
            },
            layergroup: {
                layers: [
                    namedMapLayer,
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from test_table_private_1',
                            cartocss: '#layer { marker-fill: #cc3300; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        };

        step(
            function createTemplate() {
                templateMaps.addTemplate(username, namedTilesTemplate, this);
            },
            function createLayergroup(err) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map/named/' + namedTilesTemplateName + '?api_key=1234',
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        }
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

                assert.equal(parsedBody.metadata.layers[0].type, 'mapnik');
                assert.equal(parsedBody.metadata.layers[1].type, 'mapnik');

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                return parsedBody.layergroupid;
            },
            function requestTile(err, layergroupId) {
                if (err) {
                    throw err;
                }

                var next = this;
                assert.response(server,
                    {
                        url: '/api/v1/map/' + layergroupId + '/all/0/0/0.png',
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
                templateMaps.delTemplate(username, namedTilesTemplateName, function(/*delErr*/) {
                    // ignore deletion error
                    next(err);
                });
            },
            function finish(err) {
                done(err);
            }
        );

    });
});
