'use strict';

var testHelper = require('../../support/test_helper');

var assert = require('../../support/assert');
var qs = require('querystring');

var CartodbWindshaft = require('../../../lib/cartodb/server');
var serverOptions = require('../../../lib/cartodb/server_options');

var LayergroupToken = require('../../../lib/cartodb/models/layergroup-token');

describe('get requests with cache headers', function() {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
        server.setMaxListeners(0);
    });


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
            "description": "cache headers should be present",
            "cache_headers": {
                "x_cache_channel": {
                    "db_name": "test_windshaft_cartodb_user_1_db",
                    "tables": ["public.test_table"]
                },
                "surrogate_keys": "t:77pJnX"
            },
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
                            "type": "source",
                            "params": {
                                "query": "select * from test_table limit 2"
                            }
                        }
                    ]
                },
        },
        {
            "description": "cache headers should be present and be composed with source table name",
            "cache_headers": {
                "x_cache_channel": {
                    "db_name": "test_windshaft_cartodb_user_1_db",
                    "tables": ["public.analysis_2f13a3dbd7_9eb239903a1afd8a69130d1ece0fc8b38de8592d",
                               "public.test_table"]
                },
                "surrogate_keys": "t:77pJnX t:iL4eth"
            },
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

    function validateCacheHeaders(done, expectedCacheHeaders) {
        return function(res, err) {
            if (err) {
                return done(err);
            }

            assert.ok(res.headers['x-cache-channel']);
            assert.ok(res.headers['surrogate-key']);
            assert.equal(res.headers.vary, 'Authorization');
            if (expectedCacheHeaders) {
                validateXChannelHeaders(res.headers, expectedCacheHeaders);
                assert.equal(res.headers['surrogate-key'], expectedCacheHeaders.surrogate_keys);
            }

            done();
        };
    }

    function validateXChannelHeaders(headers, expectedCacheHeaders) {
        var dbName = headers['x-cache-channel'].split(':')[0];
        var tables = headers['x-cache-channel'].split(':')[1].split(',').sort();
        assert.equal(dbName, expectedCacheHeaders.x_cache_channel.db_name);
        assert.deepEqual(tables, expectedCacheHeaders.x_cache_channel.tables.sort());
    }

    function noCacheHeaders(done) {
        return function(res, err) {
            if (err) {
                return done(err);
            }

            assert.ok(
                !res.headers['x-cache-channel'],
                'did not expect x-cache-channel header, got: `' + res.headers['x-cache-channel'] + '`'
            );
            assert.ok(
                !res.headers['surrogate-key'],
                'did not expect surrogate-key header, got: `' + res.headers['surrogate-key'] + '`'
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
            var expectedCacheHeaders = mapConfigData.cache_headers;
            it('/api/v1/map Map instantiation', function(done) {
                var testFn = validateCacheHeaders(done, expectedCacheHeaders);
                withLayergroupId(mapConfig, function(err, layergroupId, res) {
                    testFn(res);
                });
            });

            it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik retina tiles', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0@2x.png', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });

            it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik tiles', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0.png', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });

            it ('/api/v1/map/:token/:layer/:z/:x/:y.(:format) Per :layer rendering', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/0/0/0.png', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });

            it ('/api/v1/map/:token/:layer/attributes/:fid endpoint for info windows', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/' + layergroupId + '/0/attributes/1', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });

            it ('/api/v1/map/static/center/:token/:z/:lat/:lng/:width/:height.:format static maps', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/static/center/' + layergroupId + '/0/0/0/400/300.png', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });

            it ('/api/v1/map/static/bbox/:token/:bbox/:width/:height.:format static maps', function(done) {
                withLayergroupId(mapConfig, function(err, layergroupId) {
                    assert.response(
                        server,
                        getRequest('/api/v1/map/static/bbox/' + layergroupId + '/-45,-45,45,45/400/300.png', true),
                        validateCacheHeaders(done, expectedCacheHeaders)
                    );
                });
            });
        });
    });

    describe('cache headers should NOT be present', function() {

        it('/', function(done) {
            assert.response(
                server,
                getRequest('/'),
                statusOkResponse,
                noCacheHeaders(done)
            );
        });

        it('/version', function(done) {
            assert.response(
                server,
                getRequest('/version'),
                statusOkResponse,
                noCacheHeaders(done)
            );
        });

        it('/health', function(done) {
            assert.response(
                server,
                getRequest('/health'),
                statusOkResponse,
                noCacheHeaders(done)
            );
        });

        it('/api/v1/map/named list named maps', function(done) {
            assert.response(
                server,
                getRequest('/api/v1/map/named', true),
                statusOkResponse,
                noCacheHeaders(done)
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
                    noCacheHeaders(done)
                );
            });

            it('/api/v1/map/named/:template_id/jsonp Named map retrieval', function(done) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/named/' + templateName, true, 'cb'),
                    statusOkResponse,
                    noCacheHeaders(done)
                );
            });
        });
    });
});
