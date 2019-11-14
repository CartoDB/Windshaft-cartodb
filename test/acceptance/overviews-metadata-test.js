'use strict';

var testHelper = require('../support/test-helper');

var assert = require('../support/assert');
var CartodbWindshaft = require('../../lib/server');
var serverOptions = require('../../lib/server-options');

var LayergroupToken = require('../../lib/models/layergroup-token');

var RedisPool = require('redis-mpool');

var step = require('step');

var windshaft = require('windshaft');

describe('overviews metadata', function () {
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

    it('layers with and without overviews', function (done) {
        var layergroup = {
            version: '1.0.0',
            layers: [overviewsLayer, nonOverviewsLayer]
        };

        var layergroupUrl = '/api/v1/map';

        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: layergroupUrl,
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) {
                    assert.strictEqual(res.statusCode, 200, res.body);

                    var parsedBody = JSON.parse(res.body);
                    assert.strictEqual(res.headers['x-layergroup-id'], parsedBody.layergroupid);
                    expectedToken = parsedBody.layergroupid;
                    next(null, res);
                });
            },
            function doGetMapconfig (err) {
                assert.ifError(err);
                var next = this;

                var mapStore = new windshaft.storage.MapStore({
                    pool: redisPool,
                    expire_time: 500000
                });
                mapStore.load(LayergroupToken.parse(expectedToken).token, function (err, mapConfig) {
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
            function finish (err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                done(err);
            }
        );
    });

    describe('Overviews Flags', function () {
        it('Overviews used', function (done) {
            var layergroup = {
                version: '1.0.0',
                layers: [overviewsLayer, nonOverviewsLayer]
            };

            var layergroupUrl = '/api/v1/map';

            var expectedToken;
            step(
                function doPost () {
                    var next = this;
                    assert.response(server, {
                        url: layergroupUrl,
                        method: 'POST',
                        headers: { host: 'localhost', 'Content-Type': 'application/json' },
                        data: JSON.stringify(layergroup)
                    }, {}, function (res) {
                        assert.strictEqual(res.statusCode, 200, res.body);

                        const headers = JSON.parse(res.headers['x-tiler-profiler']);

                        assert.ok(headers.overviewsAddedToMapconfig);
                        assert.strictEqual(headers.mapType, 'anonymous');

                        const parsedBody = JSON.parse(res.body);
                        expectedToken = parsedBody.layergroupid;
                        next();
                    });
                },
                function finish (err) {
                    keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;
                    done(err);
                }
            );
        });
        it('Overviews NOT used', function (done) {
            var layergroup = {
                version: '1.0.0',
                layers: [nonOverviewsLayer]
            };

            var layergroupUrl = '/api/v1/map';

            var expectedToken;
            step(
                function doPost () {
                    var next = this;
                    assert.response(server, {
                        url: layergroupUrl,
                        method: 'POST',
                        headers: { host: 'localhost', 'Content-Type': 'application/json' },
                        data: JSON.stringify(layergroup)
                    }, {}, function (res) {
                        assert.strictEqual(res.statusCode, 200, res.body);

                        const headers = JSON.parse(res.headers['x-tiler-profiler']);

                        assert.strictEqual(headers.overviewsAddedToMapconfig, false);
                        assert.strictEqual(headers.mapType, 'anonymous');

                        const parsedBody = JSON.parse(res.body);
                        expectedToken = parsedBody.layergroupid;
                        next();
                    });
                },
                function finish (err) {
                    keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;
                    done(err);
                }
            );
        });
    });
});

describe('overviews metadata with filters', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var keysToDelete;

    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    it('layers with overviews', function (done) {
        var layergroup = {
            version: '1.5.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: 'SELECT * FROM test_table_overviews',
                        source: { id: 'with_overviews' },
                        cartocss: '#layer { marker-fill: black; }',
                        cartocss_version: '2.3.0'
                    }
                }
            ],
            dataviews: {
                test_names: {
                    type: 'aggregation',
                    source: { id: 'with_overviews' },
                    options: {
                        column: 'name',
                        aggregation: 'count'
                    }
                }
            },
            analyses: [
                {
                    id: 'with_overviews',
                    type: 'source',
                    params: {
                        query: 'select * from test_table_overviews'
                    }
                }
            ]
        };

        var filters = {
            dataviews: {
                test_names: { accept: ['Hawai'] }
            }
        };

        var layergroupUrl = '/api/v1/map';

        var expectedToken;
        step(
            function doPost () {
                var next = this;
                assert.response(server, {
                    url: layergroupUrl + '?filters=' + JSON.stringify(filters),
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {}, function (res) {
                    assert.strictEqual(res.statusCode, 200, res.body);
                    var parsedBody = JSON.parse(res.body);
                    assert.strictEqual(res.headers['x-layergroup-id'], parsedBody.layergroupid);
                    expectedToken = parsedBody.layergroupid;
                    next(null, res);
                });
            },
            function doGetMapconfig (err) {
                assert.ifError(err);
                var next = this;

                var mapStore = new windshaft.storage.MapStore({
                    pool: redisPool,
                    expire_time: 500000
                });
                mapStore.load(LayergroupToken.parse(expectedToken).token, function (err, mapConfig) {
                    assert.ifError(err);
                    assert.strictEqual(mapConfig._cfg.layers[0].type, 'cartodb');
                    assert.ok(mapConfig._cfg.layers[0].options.query_rewrite_data);
                    var expectedData = {
                        overviews: {
                            test_table_overviews: {
                                schema: 'public',
                                1: { table: '_vovw_1_test_table_overviews' },
                                2: { table: '_vovw_2_test_table_overviews' }
                            }
                        },
                        filters: { test_names: { type: 'category', column: 'name', params: { accept: ['Hawai'] } } },
                        unfiltered_query: 'select * from test_table_overviews',
                        filter_stats: { unfiltered_rows: 5, filtered_rows: 1 }
                    };
                    assert.deepStrictEqual(mapConfig._cfg.layers[0].options.query_rewrite_data, expectedData);
                });

                next(err);
            },
            function finish (err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expectedToken).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                done(err);
            }
        );
    });
});
