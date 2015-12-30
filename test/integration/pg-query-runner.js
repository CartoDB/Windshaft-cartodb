require('../support/test_helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/cartodb/backends/pg_connection');
var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');


describe('PgQueryRunner', function() {

    var queryRunner;

    before(function() {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({pool: redisPool});
        var pgConnection = new PgConnection(metadataBackend);
        queryRunner = new PgQueryRunner(pgConnection);
    });

    it('should work for happy case', function(done) {
        var query = 'select cartodb_id from test_table limit 3';
        queryRunner.run('localhost', query, function(err, result) {
            assert.ok(!err, err);

            assert.ok(Array.isArray(result));
            assert.equal(result.length, 3);

            done();
        });
    });

    it('should receive rows array even on error', function(done) {
        var query = 'select __error___ from test_table';
        queryRunner.run('localhost', query, function(err, result) {
            assert.ok(err);

            assert.ok(Array.isArray(result));
            assert.equal(result.length, 0);

            done();
        });
    });
});
