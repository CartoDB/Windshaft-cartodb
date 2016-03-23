require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/cartodb/backends/pg_connection');

var QueryTables = require('cartodb-query-tables');


describe('QueryTables', function() {

    var connection;

    before(function(done) {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        pgConnection.getConnection('localhost', function(err, pgConnection) {
            if (err) {
                return done(err);
            }
            connection = pgConnection;

            return done();
        });
    });

    // Check test/support/sql/windshaft.test.sql to understand where the values come from.

    it('should return an object with affected tables array and last updated time', function(done) {
        var query = 'select * from test_table';
        QueryTables.getAffectedTablesFromQuery(connection, query, function(err, result) {
            assert.ok(!err, err);

            assert.equal(result.getLastUpdatedAt(), 1234567890123);

            assert.equal(result.tables.length, 1);
            assert.deepEqual(result.tables[0], {
                dbname: 'test_windshaft_cartodb_user_1_db',
                schema_name: 'public',
                table_name: 'test_table',
                updated_at: new Date(1234567890123)
            });

            done();
        });
    });

    it('should work with private tables', function(done) {
        var query = 'select * from test_table_private_1';
        QueryTables.getAffectedTablesFromQuery(connection, query, function(err, result) {
            assert.ok(!err, err);

            assert.equal(result.getLastUpdatedAt(), 1234567890123);

            assert.equal(result.tables.length, 1);
            assert.deepEqual(result.tables[0], {
                dbname: 'test_windshaft_cartodb_user_1_db',
                schema_name: 'public',
                table_name: 'test_table_private_1',
                updated_at: new Date(1234567890123)
            });

            done();
        });
    });

});