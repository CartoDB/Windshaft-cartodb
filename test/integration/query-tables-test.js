'use strict';

require('../support/test-helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/backends/pg-connection');

var QueryTables = require('cartodb-query-tables').queryTables;

describe('QueryTables', function () {
    var connection;

    before(function (done) {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({ pool: redisPool });
        var pgConnection = new PgConnection(metadataBackend);
        pgConnection.getConnection('localhost', function (err, pgConnection) {
            if (err) {
                return done(err);
            }
            connection = pgConnection;

            return done();
        });
    });

    // Check test/support/sql/windshaft.test.sql to understand where the values come from.

    it('should return an object with affected tables array and last updated time', function () {
        var query = 'select * from test_table';
        return QueryTables.getQueryMetadataModel(connection, query)
            .then(result => {
                assert.strictEqual(result.getLastUpdatedAt(), 1234567890123);

                assert.strictEqual(result.tables.length, 1);
                assert.strictEqual(result.tables[0].dbname, 'test_windshaft_cartodb_user_1_db');
                assert.strictEqual(result.tables[0].schema_name, 'public');
                assert.strictEqual(result.tables[0].table_name, 'test_table');
            });
    });

    it('should work with private tables', function () {
        var query = 'select * from test_table_private_1';
        return QueryTables.getQueryMetadataModel(connection, query)
            .then(result => {
                assert.strictEqual(result.getLastUpdatedAt(), 1234567890123);

                assert.strictEqual(result.tables.length, 1);
                assert.strictEqual(result.tables[0].dbname, 'test_windshaft_cartodb_user_1_db');
                assert.strictEqual(result.tables[0].schema_name, 'public');
                assert.strictEqual(result.tables[0].table_name, 'test_table_private_1');
            });
    });
});
