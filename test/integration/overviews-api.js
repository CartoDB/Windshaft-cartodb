require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/cartodb/backends/pg_connection');
var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');
var QueryTablesApi = require('../../lib/cartodb/api/query_tables_api');
var OverviewsApi = require('../../lib/cartodb/api/overviews_api');


describe('OverviewsApi', function() {

    var queryTablesApi, overviewsApi;

    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        var pgQueryRunner = new PgQueryRunner(pgConnection);
        queryTablesApi = new QueryTablesApi(pgQueryRunner);
        overviewsApi = new OverviewsApi(queryTablesApi);
    });

    it('should return an empty relation for tables that have no overviews', function(done) {
        var query = 'select * from test_table';
        overviewsApi.getOverviewsMetadata('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.deepEqual(result, {});

            done();
        });
    });

    it('should return overviews metadata', function(done) {
        var query = 'select * from test_table_overviews';
        overviewsApi.getOverviewsMetadata('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.deepEqual(result, {
                'test_table_overviews': {
                  1: { table: 'test_table_overviews_ov1' },
                  2: { table: 'test_table_overviews_ov2' }
                }
            });

            done();
        });
    });

});
