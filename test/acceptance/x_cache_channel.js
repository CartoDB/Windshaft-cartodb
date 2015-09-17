var testHelper = require('../support/test_helper');

var assert = require('../support/assert');
var qs = require('querystring');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

describe('get requests x-cache-channel', function() {

    var statusOkResponse = {
        status: 200
    };

    var mapConfig = {
        version: '1.3.0',
        layers: [
            {
                options: {
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
        ]
    };

    var layergroupRequest = {
        url: '/api/v1/map?config=' + encodeURIComponent(JSON.stringify(mapConfig)),
        method: 'GET',
        headers: {
            host: 'localhost'
        }
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

    function withLayergroupId(callback) {
        assert.response(
            server,
            layergroupRequest,
            statusOkResponse,
            function(res, err) {
                if (err) {
                    return callback(err);
                }
                callback(null, JSON.parse(res.body).layergroupid);
            }
        );
    }

    describe('header should be present', function() {

        after(function(done) {
            testHelper.deleteRedisKeys({
                'map_cfg|a181ac96fac6d2b315dda88bc0bfa6cd': 0,
                'user:localhost:mapviews:global': 5
            }, done);
        });

        it('/api/v1/map Map instantiation', function(done) {
            assert.response(
                server,
                layergroupRequest,
                statusOkResponse,
                validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
            );
        });

        it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik retina tiles', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/' + layergroupId + '/0/0/0@2x.png'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
            });
        });

        it ('/api/v1/map/:token/:z/:x/:y@:scale_factor?x.:format Mapnik tiles', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/' + layergroupId + '/0/0/0.png'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
            });
        });

        it ('/api/v1/map/:token/:layer/:z/:x/:y.(:format) Per :layer rendering', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/' + layergroupId + '/0/0/0/0.png'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
            });
        });

        it ('/api/v1/map/:token/:layer/attributes/:fid endpoint for info windows', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/' + layergroupId + '/0/attributes/1'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
            });
        });

        it ('/api/v1/map/static/center/:token/:z/:lat/:lng/:width/:height.:format static maps', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/static/center/' + layergroupId + '/0/0/0/400/300.png'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
            });
        });

        it ('/api/v1/map/static/bbox/:token/:bbox/:width/:height.:format static maps', function(done) {
            withLayergroupId(function(err, layergroupId) {
                assert.response(
                    server,
                    getRequest('/api/v1/map/static/bbox/' + layergroupId + '/-45,-45,45,45/400/300.png'),
                    validateXCacheChannel(done, 'test_windshaft_cartodb_user_1_db:public.test_table')
                );
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

            before(function(done) {
                var template =  {
                    version: '0.0.1',
                    name: templateName,
                    auth: {
                        method: 'open'
                    },
                    layergroup:  mapConfig
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

            after(function(done) {
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
