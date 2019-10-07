'use strict';

require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/backends/pg_connection');

var QueryTables = require('cartodb-query-tables').queryTables;


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
        QueryTables.getQueryMetadataModel(connection, query, function(err, result) {
            assert.ok(!err, err);

            assert.equal(result.getLastUpdatedAt(), 1234567890123);

            assert.equal(result.tables.length, 1);
            assert.equal(result.tables[0].dbname, 'test_windshaft_cartodb_user_1_db');
            assert.equal(result.tables[0].schema_name, 'public');
            assert.equal(result.tables[0].table_name, 'test_table');

            done();
        });
    });

    it('should work with private tables', function(done) {
        var query = 'select * from test_table_private_1';
        QueryTables.getQueryMetadataModel(connection, query, function(err, result) {
            assert.ok(!err, err);

            assert.equal(result.getLastUpdatedAt(), 1234567890123);

            assert.equal(result.tables.length, 1);
            assert.equal(result.tables[0].dbname, 'test_windshaft_cartodb_user_1_db');
            assert.equal(result.tables[0].schema_name, 'public');
            assert.equal(result.tables[0].table_name, 'test_table_private_1');

            done();
        });
    });

});
