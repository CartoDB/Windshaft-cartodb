/**
 * User: simon
 * Date: 30/08/2011
 * Time: 13:52
 * Desc: Loads test specific variables
 */

var assert = require('assert');
var fs = require('fs');
var LZMA  = require('lzma').LZMA;

var lzmaWorker = new LZMA();

var redis = require('redis');
var nock = require('nock');
var log4js = require('log4js');
var pg = require('pg');
var _ = require('underscore');

// set environment specific variables
global.environment  = require(__dirname + '/../../config/environments/test');
global.environment.name = 'test';
process.env.NODE_ENV = 'test';


// don't output logs in test environment to reduce noise
log4js.configure({ appenders: [] });
global.logger = log4js.getLogger();


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

    function createSet(keys, key) {
        keys[key] = true;
        return keys;
    }
    var keys = res.headers['surrogate-key'].split(' ').reduce(createSet, {});
    var expectedKeys = expectedKey.split(' ').reduce(createSet, {});

    assert.deepEqual(keys, expectedKeys);
}

var redisClient;

beforeEach(function() {
    if (!redisClient) {
        redisClient = redis.createClient(global.environment.redis.port);
    }
});

//global afterEach to capture test suites that leave keys in redis
afterEach(function(done) {

    // restoring nock globally after each suite
    nock.cleanAll();
    nock.enableNetConnect();

    var expectedKeys = {
        'rails:test_windshaft_cartodb_user_1_db:test_table_private_1': true,
        'rails:test_windshaft_cartodb_user_1_db:my_table': true,
        'rails:users:localhost:map_key': true,
        'rails:users:cartodb250user': true,
        'rails:users:localhost': true,
        'api_keys:localhost:default_public': true,
        'api_keys:localhost:master_master_master_master_master_master': true
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
                keysFound.push('[db='+db+']'+k);
            }
        });

        if (Object.keys(databasesTasks).length === 0) {
            assert.equal(keysFound.length, 0, 'Unexpected keys found in redis: ' + keysFound.join(', '));
            done();
        }
    }

    Object.keys(databasesTasks).forEach(function(db) {
        redisClient.select(db, function() {
            // Check that we start with an empty redis db
            redisClient.keys("*", function(err, keys) {
                return taskDone(err, db, keys);
            });
        });
    });
});

function cleanPGPoolConnections () {
    // TODO: this method will be replaced by psql.end
    pg.end();
}

function deleteRedisKeys(keysToDelete, callback) {

    if (Object.keys(keysToDelete).length === 0) {
        return callback();
    }

    function taskDone(k) {
        delete keysToDelete[k];
        if (Object.keys(keysToDelete).length === 0) {
            callback();
        }
    }

    Object.keys(keysToDelete).forEach(function(k) {
        var redisClient = redis.createClient(global.environment.redis.port);
        redisClient.select(keysToDelete[k], function() {
            redisClient.del(k, function(err, deletedKeysCount) {
                redisClient.quit();
                assert.notStrictEqual(deletedKeysCount, 0, 'No KEYS deleted for: [db=' + keysToDelete[k] + ']' + k);
                taskDone(k);
            });
        });
    });
}

function rmdirRecursiveSync(dirname) {
    var files = fs.readdirSync(dirname);
    for (var i=0; i<files.length; ++i) {
        var f = dirname + "/" + files[i];
        var s = fs.lstatSync(f);
        if ( s.isFile() ) {
            fs.unlinkSync(f);
        }
        else {
            rmdirRecursiveSync(f);
        }
    }
}

function configureMetadata(action, params, callback) {
    redisClient.SELECT(5, function (err) {
        if (err) {
            return callback(err);
        }

        redisClient[action](params, function (err) {
            if (err) {
                return callback(err);
            }

            return callback();
        });
    });
}

function getTestContextDbObject() {
    const dbConfig = global.environment.postgres;
    const user_id = 1;
    const user = _.template(global.environment.postgres_auth_user)({ user_id });
    const password = _.template(global.environment.postgres_auth_pass)({ user_id });
    
    return {
        host: dbConfig.host,
        port: dbConfig.port,
        name: user,
        user,
        password
    };
}

module.exports = {
  deleteRedisKeys: deleteRedisKeys,
  lzma_compress_to_base64: lzma_compress_to_base64,
  checkNoCache: checkNoCache,
  checkSurrogateKey: checkSurrogateKey,
  checkCache: checkCache,
  rmdirRecursiveSync: rmdirRecursiveSync,
  configureMetadata,
  cleanPGPoolConnections,
  getTestContextDbObject
};
