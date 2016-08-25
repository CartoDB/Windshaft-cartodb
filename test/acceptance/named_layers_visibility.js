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

    var username = 'localhost';

    var wadusLayer = {
        type: 'cartodb',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { marker-fill: <%= color %>; }',
            cartocss_version: '2.3.0'
        }
    };


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

    var namedMapLayer = {
        type: 'named',
        options: {
            name: templateName,
            config: {},
            auth_tokens: []
        }
    };

    var notVisibileLayer = {
        type: 'cartodb',
        options: {
            sql: 'select 1 cartodb_id, null::geometry the_geom_webmercator',
            cartocss: '#layer { marker-fill: <%= color %>; }',
            cartocss_version: '2.3.0',
            visibility: false
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
        templateMaps.addTemplate(username, template, function(err) {
            return done(err);
        });
    });

    afterEach(function(done) {
        global.environment.enabledFeatures = {cdbQueryTablesFromPostgres: false};
        templateMaps.delTemplate(username, templateName, function(err) {
            return done(err);
        });
    });


    it('should work with visibility tiles', function(done) {

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
                    },
                    notVisibileLayer
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
