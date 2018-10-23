'use strict';

require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/cartodb/backends/pg_connection');
var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');
var OverviewsMetadataBackend = require('../../lib/cartodb/backends/overviews-metadata');


describe('OverviewsMetadataBackend', function() {

    var overviewsMetadataBackend;

    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        var pgQueryRunner = new PgQueryRunner(pgConnection);
        overviewsMetadataBackend = new OverviewsMetadataBackend(pgQueryRunner);
    });

    it('should return an empty relation for tables that have no overviews', function(done) {
        var query = 'select * from test_table';
        overviewsMetadataBackend.getOverviewsMetadata('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.deepEqual(result, {});

            done();
        });
    });

    it('should return overviews metadata', function(done) {
        var query = 'select * from test_table_overviews';
        overviewsMetadataBackend.getOverviewsMetadata('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.deepEqual(result, {
                'test_table_overviews': {
                    schema: 'public',
                    1: { table: '_vovw_1_test_table_overviews' },
                    2: { table: '_vovw_2_test_table_overviews' }
                }
            });

            done();
        });
    });

});
