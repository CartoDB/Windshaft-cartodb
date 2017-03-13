var testHelper = require('../support/test_helper');

var assert = require('../support/assert');
var qs = require('querystring');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

var LayergroupToken = require('../support/layergroup-token');

describe('get requests x-cache-channel', function() {

    var keysToDelete;
    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var statusOkResponse = {
        status: 200
    };

    var mapConfigs = [
        {
            "description": "header should be present",
            "x_cache_channel": "test_windshaft_cartodb_user_1_db:public.test_table",
            "data":
                {
                    version: '1.4.0',
                    layers: [
                        {
                            options: {
                                source: {
                                    id: "2570e105-7b37-40d2-bdf4-1af889598745"
                                },
                                sql: 'select * from test_table limit 2',
                                cartocss: '#layer { marker-fill:red; }',
                                cartocss_version: '2.3.0',
                                attributes: {
                                    id:'cartodb_id',
                                    columns: [
                                        'name',
                                        'address'
                                    ]
                                }
                            }
                        }
                    ],
                    analyses: [
                        {
                            "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                            "type": "source",
                            "params": {
                                "query": "select * from test_table limit 2"
                            }
                        }
                    ]
                },
        },
        {
            "description": "header should be present and be composed with source table name",
            "x_cache_channel": "test_windshaft_cartodb_user_1_db:" +
                               "public.analysis_2f13a3dbd7_9eb239903a1afd8a69130d1ece0fc8b38de8592d" +
                               ",public.test_table",
            "data":
            {
                version: '1.5.0',
                layers: [
                    {
                        options: {
                            source: {
                                id: "2570e105-7b37-40d2-bdf4-1af889598745"
                            },
                            sql: 'select * from test_table limit 2',
                            cartocss: '#layer { marker-fill:red; }',
                            cartocss_version: '2.3.0',
                            attributes: {
                                id:'cartodb_id',
                                columns: [
                                    'name',
                                    'address'
                                ]
                            }
                        }
                    }
                ],
                analyses: [
                    {
                        "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                        "type": "buffer",
                        "params": {
                            "source": {
                                "type": "source",
                                "params": {
                                    "query": "select * from test_table limit 2"
                                }
                            },
                            "radius": 50000
                        }
                    }
                ]
            }
        }];

    var layergroupRequest = function(mapConfig) {
        return {
            url: '/api/v1/map?api_key=1234&config=' + encodeURIComponent(JSON.stringify(mapConfig)),
            method: 'GET',
            headers: {
                host: 'localhost'
            }
        };
    };

    function getRequest(url, addApiKey, callbackName) {
        var params = {};
        if (!!addApiKey) {
            params.api_key = '1234';
        }
        if (!!callbackName) {
            params.callback = callbackName;
        }

        return {
            url: url + '?' + qs.stringify(params),
            method: 'GET',
            headers: {
                host: 'localhost',
                'Content-Type': 'application/json'
            }
        };
    }

    function validateXCacheChannel(done, expectedCacheChannel) {
        return function(res, err) {
            if (err) {
                return done(err);
            }

            assert.ok(res.headers['x-cache-channel']);
            if (expectedCacheChannel) {
                assert.equal(res.headers['x-cache-channel'], expectedCacheChannel);
            }

            done();
        };
    }

    function noXCacheChannelHeader(done) {
        return function(res, err) {
            if (err) {
                return done(err);
            }

            assert.ok(
                !res.headers['x-cache-channel'],
                'did not expect x-cache-channel header, got: `' + res.headers['x-cache-channel'] + '`'
            );
            done();
        };
    }

    function withLayergroupId(mapConfig, callback) {
        assert.response(
            server,
            layergroupRequest(mapConfig),
            statusOkResponse,
            function(res, err) {
                if (err) {
                    return callback(err);
                }
                var layergroupId = JSON.parse(res.body).layergroupid;
                keysToDelete['map_cfg|' + LayergroupToken.parse(layergroupId).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                callback(null, layergroupId, res);
            }
        );
    }

    mapConfigs.forEach(function(mapConfigData) {
        describe(mapConfigData.description, function() {
            var mapConfig = mapConfigData.data;
            var expectedCacheChannel = mapConfigData.x_cache_channel;
            it('/api/v1/map Map instantiation', function(done) {
                var testFn = validateXCacheChannel(done, expectedCacheChannel);
                withLayergroupId(mapConfig, function(err, layergroupId, res) {
                    testFn(res);
                });
            });

            it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik retina tiles', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0@2x.png', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });

            it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik tiles', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0.png', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });

            it ('/api/v1/map/:token/:layer/:z/:x/:y.(:format) Per :layer rendering', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0/0.png', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });

            it ('/api/v1/map/:token/:layer/attributes/:fid endpoint for info windows', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/attributes/1', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });

            it ('/api/v1/map/static/center/:token/:z/:lat/:lng/:width/:height.:format static maps', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/static/center/' + layergroupId + '/0/0/0/400/300.png', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });

            it ('/api/v1/map/static/bbox/:token/:bbox/:width/:height.:format static maps', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/static/bbox/' + layergroupId + '/-45,-45,45,45/400/300.png', true),
                        validateXCacheChannel(done, expectedCacheChannel)
                    );
                });
            });
        });
    });

    describe('header should NOT be present', function() {

        it('/', function(done) {
            assert.response(
                server,
                getRequest('/'),
                statusOkResponse,
                noXCacheChannelHeader(done)
            );
        });

        it('/version', function(done) {
            assert.response(
                server,
                getRequest('/version'),
                statusOkResponse,
                noXCacheChannelHeader(done)
            );
        });

        it('/health', function(done) {
            assert.response(
                server,
                getRequest('/health'),
                statusOkResponse,
                noXCacheChannelHeader(done)
            );
        });

        it('/api/v1/map/named list named maps', function(done) {
            assert.response(
                server,
                getRequest('/api/v1/map/named', true),
                statusOkResponse,
                noXCacheChannelHeader(done)
            );
        });

        describe('with named maps', function() {

            var templateName = 'x_cache';

            beforeEach(function(done) {
                var template =  {
                    version: '0.0.1',
                    name: templateName,
                    auth: {
                        method: 'open'
                    },
                    layergroup:  mapConfigs[0].data
                };

                var namedMapRequest = {
                    url: '/api/v1/map/named?api_key=1234',
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(template)
                };

                assert.response(
                    server,
                    namedMapRequest,
                    statusOkResponse,
                    function(res, err) {
                        done(err);
                    }
                );
            });

            afterEach(function(done) {
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named/' + templateName + '?api_key=1234',
                        method: 'DELETE',
                        headers: {
                            host: 'localhost'
                        }
                    },
                    {
                        status: 204
                    },
                    function(res, err) {
                        done(err);
                    }
                );
            });


            it('/api/v1/map/named/:template_id Named map retrieval', function(done) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/named/' + templateName, true),
                    statusOkResponse,
                    noXCacheChannelHeader(done)
                );
            });

            it('/api/v1/map/named/:template_id/jsonp Named map retrieval', function(done) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/named/' + templateName, true, 'cb'),
                    statusOkResponse,
                    noXCacheChannelHeader(done)
                );
            });
        });
    });
});
