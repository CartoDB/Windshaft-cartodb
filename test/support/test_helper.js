/**
 * User: simon
 * Date: 30/08/2011
 * Time: 13:52
 * Desc: Loads test specific variables
 */

var assert = require('assert');
var LZMA  = require('lzma').LZMA;

var lzmaWorker = new LZMA();

// set environment specific variables
global.environment  = require(__dirname + '/../../config/environments/test');
global.environment.name = 'test';
process.env.NODE_ENV = 'test';


// Utility function to compress & encode LZMA
function lzma_compress_to_base64(payload, mode, callback) {
  lzmaWorker.compress(payload, mode,
    function(ints) {
      ints = ints.map(function(c) { return String.fromCharCode(c + 128); }).join('');
      var base64 = new Buffer(ints, 'binary').toString('base64');
      callback(null, base64);
    },
    function(/*percent*/) {
      //console.log("Compressing: " + percent + "%");
    }
  );
}

// Check that the response headers do not request caching
// Throws on failure
function checkNoCache(res) {
  assert.ok(!res.headers.hasOwnProperty('x-cache-channel'));
  assert.ok(!res.headers.hasOwnProperty('surrogate-key'));
  assert.ok(!res.headers.hasOwnProperty('cache-control')); // is this correct ?
  assert.ok(!res.headers.hasOwnProperty('last-modified')); // is this correct ?
}


/**
 * Check that the response headers do not request caching
 * @see checkNoCache
 * @param res
 */
function checkCache(res) {
    assert.ok(res.headers.hasOwnProperty('x-cache-channel'));
    assert.ok(res.headers.hasOwnProperty('cache-control'));
    assert.ok(res.headers.hasOwnProperty('last-modified'));
}

function checkSurrogateKey(res, expectedKey) {
    assert.ok(res.headers.hasOwnProperty('surrogate-key'));
    assert.equal(res.headers['surrogate-key'], expectedKey);
}

//var _ = require('underscore');
var redis = require('redis');
//global after to capture test suites that leave keys in redis
after(function(done) {
    var expectedKeys = {
        'rails:test_windshaft_cartodb_user_1_db:test_table_private_1': true,
        'rails:test_windshaft_cartodb_user_1_db:my_table': true,
        'rails:users:localhost:map_key': true,
        'rails:users:cartodb250user': true,
        'rails:users:localhost': true
    };
    var databasesTasks = { 0: 'users', 5: 'meta'};

    var keysFound = [];
    function taskDone(err, db, keys) {
        if (err) {
            return done(err);
        }

        delete databasesTasks[db];
        keys.forEach(function(k) {
            if (!expectedKeys[k]) {
                keysFound.push(k);
            }
        });

        if (Object.keys(databasesTasks).length === 0) {
            assert.equal(keysFound.length, 0, 'Unexpected keys found in redis: ' + keysFound.join(', '));
            done();
        }
    }

    Object.keys(databasesTasks).forEach(function(db) {
        var redisClient = redis.createClient(global.environment.redis.port);
        redisClient.select(db, function() {
            // Check that we start with an empty redis db
            redisClient.keys("*", function(err, keys) {
                return taskDone(err, db, keys);
            });
        });
    });
});

function deleteRedisKeys(keysToDelete, callback) {

    function taskDone(k) {
        delete keysToDelete[k];
        if (Object.keys(keysToDelete).length === 0) {
            callback();
        }
    }

    Object.keys(keysToDelete).forEach(function(k) {
        var redisClient = redis.createClient(global.environment.redis.port);
        redisClient.select(keysToDelete[k], function() {
            redisClient.del(k, function() {
                taskDone(k);
            });
        });
    });
}


module.exports = {
  deleteRedisKeys: deleteRedisKeys,
  lzma_compress_to_base64: lzma_compress_to_base64,
  checkNoCache: checkNoCache,
  checkSurrogateKey: checkSurrogateKey,
  checkCache: checkCache
};

