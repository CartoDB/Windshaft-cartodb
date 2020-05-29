'use strict';

require('../support/test-helper');

var assert = require('assert');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var PgConnection = require('../../lib/backends/pg-connection');
var PgQueryRunner = require('../../lib/backends/pg-query-runner');

describe('PgQueryRunner', function () {
    var queryRunner;

    before(function () {
        var redisPool = new RedisPool(global.environment.redis);
        var metadataBackend = cartodbRedis({ pool: redisPool });
        var pgConnection = new PgConnection(metadataBackend);
        queryRunner = new PgQueryRunner(pgConnection);
    });

    it('should work for happy case', function (done) {
        var query = 'select cartodb_id from test_table limit 3';
        queryRunner.run('localhost', query, function (err, result) {
            assert.ok(!err, err);

            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 3);

            done();
        });
    });
});
