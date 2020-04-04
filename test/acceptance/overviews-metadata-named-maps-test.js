'use strict';

var testHelper = require('../support/test-helper');

var assert = require('../support/assert');
var CartodbWindshaft = require('../../lib/server');
var serverOptions = require('../../lib/server-options');

var LayergroupToken = require('../../lib/models/layergroup-token');

var RedisPool = require('redis-mpool');

var step = require('step');

const MapStore = require('../support/map-store');

describe('overviews metadata for named maps', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var overviewsLayer = {
        type: 'cartodb',
        options: {
            sql: 'SELECT * FROM test_table_overviews',
            cartocss: '#layer { marker-fill: black; }',
            cartocss_version: '2.3.0'
        }
    };

    var nonOverviewsLayer = {
        type: 'cartodb',
        options: {
            sql: 'SELECT * FROM test_table',
            cartocss: '#layer { marker-fill: black; }',
            cartocss_version: '2.3.0'
        }
    };

    var keysToDelete;

    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var templateId = 'overviews-template-1';

    var template = {
        version: '0.0.1',
        name: templateId,
        auth: { method: 'open' },
        layergroup: {
            version: '1.0.0',
            layers: [overviewsLayer, nonOverviewsLayer]
        }
    };

    it('should add overviews data to layers', function (done) {
        step(
            function postTemplate () {
                var next = this;

                assert.response(server, {
                    url: '/api/v1/map/named?api_key=1234',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(template)
                }, {}, function (res, err) {
                    next(err, res);
                });
            },
            function checkTemplate (err, res) {
                assert.ifError(err);

                var next = this;
                assert.strictEqual(res.statusCode, 200);
                assert.deepStrictEqual(JSON.parse(res.body), {
                    template_id: templateId
                });
                next(null);
            },
            function instantiateTemplate (err) {
                assert.ifError(err);

                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/named/' + templateId,
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    }
                }, {},
                function (res, err) {
                    return next(err, res);
                });
            },
            function checkInstanciation (err, res) {
                assert.ifError(err);

                var next = this;

                assert.strictEqual(res.statusCode, 200);

                var parsedBody = JSON.parse(res.body);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                assert.ok(parsedBody.layergroupid);
                assert.ok(parsedBody.last_updated);

                next(null, parsedBody.layergroupid);
            },

            function checkMapconfig (err, layergroupId) {
                assert.ifError(err);

                var next = this;

                const mapStore = new MapStore(redisPool);
                mapStore.load(LayergroupToken.parse(layergroupId).token, function (err, mapConfig) {
                    assert.ifError(err);
                    assert.deepStrictEqual(nonOverviewsLayer, mapConfig._cfg.layers[1]);
                    assert.strictEqual(mapConfig._cfg.layers[0].type, 'cartodb');
                    assert.ok(mapConfig._cfg.layers[0].options.query_rewrite_data);
                    var expectedData = {
                        overviews: {
                            test_table_overviews: {
                                schema: 'public',
                                1: { table: '_vovw_1_test_table_overviews' },
                                2: { table: '_vovw_2_test_table_overviews' }
                            }
                        }
                    };
                    assert.deepStrictEqual(mapConfig._cfg.layers[0].options.query_rewrite_data, expectedData);
                });

                next(err);
            },
            function deleteTemplate (err) {
                assert.ifError(err);

                var next = this;

                assert.response(server, {
                    url: '/api/v1/map/named/' + templateId + '?api_key=1234',
                    method: 'DELETE',
                    headers: { host: 'localhost' }
                }, {}, function (res, err) {
                    next(err, res);
                });
            },
            function checkDeleteTemplate (err, res) {
                assert.ifError(err);
                assert.strictEqual(res.statusCode, 204);
                assert.ok(!res.body);

                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });

    describe('Overviews Flags', function () {
        it('Overviews used', function (done) {
            step(
                function postTemplate () {
                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/named?api_key=1234',
                        method: 'POST',
                        headers: { host: 'localhost', 'Content-Type': 'application/json' },
                        data: JSON.stringify(template)
                    }, {}, function (res, err) {
                        next(err, res);
                    });
                },
                function instantiateTemplate (err) {
                    assert.ifError(err);

                    var next = this;
                    assert.response(server, {
                        url: '/api/v1/map/named/' + templateId,
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        }
                    }, {},
                    function (res, err) {
                        return next(err, res);
                    });
                },
                function checkFlags (err, res) {
                    assert.ifError(err);

                    var next = this;

                    var parsedBody = JSON.parse(res.body);

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    const headers = JSON.parse(res.headers['x-tiler-profiler']);

                    assert.ok(headers.overviewsAddedToMapconfig);
                    assert.strictEqual(headers.mapType, 'named');

                    next();
                },

                function finish (err) {
                    done(err);
                }
            );
        });

        it('Overviews NOT used', function (done) {
            const nonOverviewsTemplateId = 'non-overviews-template';

            var nonOverviewsTemplate = {
                version: '0.0.1',
                name: nonOverviewsTemplateId,
                auth: { method: 'open' },
                layergroup: {
                    version: '1.0.0',
                    layers: [nonOverviewsLayer]
                }
            };

            step(
                function postTemplate () {
                    var next = this;

                    assert.response(server, {
                        url: '/api/v1/map/named?api_key=1234',
                        method: 'POST',
                        headers: { host: 'localhost', 'Content-Type': 'application/json' },
                        data: JSON.stringify(nonOverviewsTemplate)
                    }, {}, function (res, err) {
                        next(err, res);
                    });
                },
                function instantiateTemplate (err) {
                    assert.ifError(err);

                    var next = this;
                    assert.response(server, {
                        url: '/api/v1/map/named/' + nonOverviewsTemplateId,
                        method: 'POST',
                        headers: {
                            host: 'localhost',
                            'Content-Type': 'application/json'
                        }
                    }, {},
                    function (res, err) {
                        return next(err, res);
                    });
                },
                function checkFlags (err, res) {
                    assert.ifError(err);

                    var next = this;

                    var parsedBody = JSON.parse(res.body);

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    const headers = JSON.parse(res.headers['x-tiler-profiler']);

                    assert.strictEqual(headers.overviewsAddedToMapconfig, false);
                    assert.strictEqual(headers.mapType, 'named');

                    next();
                },

                function finish (err) {
                    done(err);
                }
            );
        });
    });
});
