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
//var redis = require('redis');
// global afterEach to capture tests that leave keys in redis
//afterEach(function(done) {
//    var redisClient = redis.createClient(global.environment.redis.port);
//    // Check that we start with an empty redis db
//    redisClient.keys("*", function(err, keys) {
//        if ( err ) {
//            return done(err);
//        }
//        assert.equal(keys.length, 0, "test left objects in redis:\n" + keys.join("\n"));
//        redisClient.flushall(done);
//    });
//});


module.exports = {
  lzma_compress_to_base64: lzma_compress_to_base64,
  checkNoCache: checkNoCache,
  checkSurrogateKey: checkSurrogateKey,
  checkCache: checkCache
};

