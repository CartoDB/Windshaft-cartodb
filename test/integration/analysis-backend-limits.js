var testHelper = require('../support/test_helper');

var assert = require('assert');
var redis = require('redis');

var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');

var AnalysisBackend = require('../../lib/cartodb/backends/analysis');

describe('analysis-backend limits', function() {

    var redisClient;
    var keysToDelete;
    var user = 'localhost';

    beforeEach(function() {
        redisClient = redis.createClient(global.environment.redis.port);
        keysToDelete = {};
        var redisPool = new RedisPool(global.environment.redis);
        this.metadataBackend = cartodbRedis({pool: redisPool});
    });

    afterEach(function(done) {
        redisClient.quit(function() {
            testHelper.deleteRedisKeys(keysToDelete, done);
        });
    });

    function withAnalysesLimits(limits, callback) {
        redisClient.SELECT(5, function(err) {
            if (err) {
                return callback(err);
            }
            var analysesLimitsKey = 'limits:analyses:' + user;
            redisClient.HMSET([analysesLimitsKey].concat(limits), function(err) {
                if (err) {
                    return callback(err);
                }
                keysToDelete[analysesLimitsKey] = 5;
                return callback();
            });
        });
    }

    it("should use limits from configuration", function(done) {
        var analysisBackend = new AnalysisBackend(this.metadataBackend, { limits: { moran: 5000, kmeans: 5000 } });
        analysisBackend.getAnalysesLimits(user, function(err, result) {
            assert.ok(!err, err);

            assert.ok(result.analyses.moran);
            assert.equal(result.analyses.moran.timeout, 5000);

            assert.ok(result.analyses.kmeans);
            assert.equal(result.analyses.kmeans.timeout, 5000);

            done();
        });
    });

    it("should use limits from redis", function(done) {
        var self = this;
        var limits = ['moran', 5000];

        withAnalysesLimits(limits, function(err) {
            if (err) {
                return done(err);
            }

            var analysisBackend = new AnalysisBackend(self.metadataBackend);
            analysisBackend.getAnalysesLimits(user, function(err, result) {
                assert.ok(!err, err);

                assert.ok(result.analyses.moran);
                assert.equal(result.analyses.moran.timeout, 5000);

                done();
            });
        });
    });

    it("should use limits from redis and configuration, redis takes priority", function(done) {
        var self = this;
        var limits = ['moran', 5000];

        withAnalysesLimits(limits, function(err) {
            if (err) {
                return done(err);
            }

            var analysisBackend = new AnalysisBackend(self.metadataBackend, { limits: { moran: 1000 } });
            analysisBackend.getAnalysesLimits(user, function(err, result) {
                assert.ok(!err, err);

                assert.ok(result.analyses.moran);
                assert.equal(result.analyses.moran.timeout, 5000);

                done();
            });
        });
    });

    it("should use limits from redis and configuration, defaulting for values not present in redis", function(done) {
        var self = this;
        var limits = ['moran', 5000];

        withAnalysesLimits(limits, function(err) {
            if (err) {
                return done(err);
            }

            var analysisBackend = new AnalysisBackend(self.metadataBackend, { limits: { moran: 1000, kmeans: 1000 } });
            analysisBackend.getAnalysesLimits(user, function(err, result) {
                assert.ok(!err, err);

                assert.ok(result.analyses.moran);
                assert.equal(result.analyses.moran.timeout, 5000);

                assert.ok(result.analyses.kmeans);
                assert.equal(result.analyses.kmeans.timeout, 1000);

                done();
            });
        });
    });

});
