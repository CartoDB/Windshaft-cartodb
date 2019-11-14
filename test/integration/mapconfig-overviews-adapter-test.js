'use strict';

require('../support/test-helper');

var assert = require('assert');
var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var PgConnection = require('../../lib/backends/pg-connection');
var PgQueryRunner = require('../../lib/backends/pg-query-runner');
var OverviewsMetadataBackend = require('../../lib/backends/overviews-metadata');
var FilterStatsBackend = require('../../lib/backends/filter-stats');
var MapConfigOverviewsAdapter = require('../../lib/models/mapconfig/adapter/mapconfig-overviews-adapter');

var redisPool = new RedisPool(global.environment.redis);
var metadataBackend = cartodbRedis({ pool: redisPool });
var pgConnection = new PgConnection(metadataBackend);
var pgQueryRunner = new PgQueryRunner(pgConnection);
var overviewsMetadataBackend = new OverviewsMetadataBackend(pgQueryRunner);
var filterStatsBackend = new FilterStatsBackend(pgQueryRunner);

var mapConfigOverviewsAdapter = new MapConfigOverviewsAdapter(overviewsMetadataBackend, filterStatsBackend);

describe('MapConfigOverviewsAdapter', function () {
    it('should not modify layers for which no overviews are available', function (done) {
        var sql = 'SELECT * FROM test_table';
        var cartocss = '#layer { marker-fill: black; }';
        var cartocssVersion = '2.3.0';
        var layerWithoutOverviews = {
            type: 'cartodb',
            options: {
                sql: sql,
                cartocss: cartocss,
                cartocss_version: cartocssVersion
            }
        };

        var _mapConfig = {
            layers: [layerWithoutOverviews]
        };

        var params = {};
        var context = {};

        mapConfigOverviewsAdapter.getMapConfig('localhost', _mapConfig, params, context, function (err, mapConfig) {
            assert.ok(!err);
            var layers = mapConfig.layers;
            assert.strictEqual(layers.length, 1);
            assert.strictEqual(layers[0].type, 'cartodb');
            assert.strictEqual(layers[0].options.sql, sql);
            assert.strictEqual(layers[0].options.cartocss, cartocss);
            assert.strictEqual(layers[0].options.cartocss_version, cartocssVersion);
            assert.strictEqual(layers[0].options.overviews, undefined);
            done();
        });
    });
});

describe('MapConfigOverviewsAdapter', function () {
    it('should add overviews metadata for layers using tables with overviews', function (done) {
        var sql = 'SELECT * FROM test_table_overviews';
        var cartocss = '#layer { marker-fill: black; }';
        var cartocssVersion = '2.3.0';
        var layerWithOverviews = {
            type: 'cartodb',
            options: {
                sql: sql,
                cartocss: cartocss,
                cartocss_version: cartocssVersion
            }
        };

        var _mapConfig = {
            layers: [layerWithOverviews]
        };

        var params = {};
        var context = {};

        mapConfigOverviewsAdapter.getMapConfig('localhost', _mapConfig, params, context, function (err, mapConfig) {
            assert.ok(!err);
            var layers = mapConfig.layers;
            assert.strictEqual(layers.length, 1);
            assert.strictEqual(layers[0].type, 'cartodb');
            assert.strictEqual(layers[0].options.sql, sql);
            assert.strictEqual(layers[0].options.cartocss, cartocss);
            assert.strictEqual(layers[0].options.cartocss_version, cartocssVersion);
            assert.ok(layers[0].options.query_rewrite_data);
            var expectedData = {
                overviews: {
                    test_table_overviews: {
                        schema: 'public',
                        1: { table: '_vovw_1_test_table_overviews' },
                        2: { table: '_vovw_2_test_table_overviews' }
                    }
                }
            };
            assert.deepStrictEqual(layers[0].options.query_rewrite_data, expectedData);
            done();
        });
    });
});
