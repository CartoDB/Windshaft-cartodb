require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/cartodb/backends/pg_connection');
var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');
var QueryTablesApi = require('../../lib/cartodb/api/query_tables_api');


describe('QueryTablesApi', function() {

    var queryTablesApi;

    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        var pgQueryRunner = new PgQueryRunner(pgConnection);
        queryTablesApi = new QueryTablesApi(pgQueryRunner);
    });

    // Check test/support/sql/windshaft.test.sql to understand where the values come from.

    it('should return an object with affected tables array and last updated time', function(done) {
        var query = 'select * from test_table';
        queryTablesApi.getAffectedTablesAndLastUpdatedTime('localhost', query, function(err, result) {
            assert.ok(!err, err);
            assert.deepEqual(result, {
                affectedTables: [{dbname: "test_windshaft_cartodb_user_1_db", schema_name: "public", "table_name": 'test_table', updated_at: new Date(1234567890123)}],
                lastUpdatedTime: 1234567890123
            });

            done();
        });
    });

    it('should work with private tables', function(done) {
        var query = 'select * from test_table_private_1';
        queryTablesApi.getAffectedTablesAndLastUpdatedTime('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.deepEqual(result, {
                affectedTables: [{dbname: "test_windshaft_cartodb_user_1_db", schema_name: "public", "table_name": 'test_table_private_1', updated_at: new Date(1234567890123)}],
                lastUpdatedTime: 1234567890123
            });

            done();
        });
    });

});
