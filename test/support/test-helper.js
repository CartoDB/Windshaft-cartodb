'use strict';

/**
 * User: simon
 * Date: 30/08/2011
 * Time: 13:52
 * Desc: Loads test specific variables
 */

var assert = require('assert');
var fs = require('fs');
var LZMA = require('lzma').LZMA;

var lzmaWorker = new LZMA();

var redis = require('redis');
var log4js = require('log4js');
const setICUEnvVariable = require('../../lib/utils/icu-data-env-setter');

// set environment specific variables
global.environment = require('../../config/environments/test');
global.environment.name = 'test';
process.env.NODE_ENV = 'test';

setICUEnvVariable();

// don't output logs in test environment to reduce noise
log4js.configure({ appenders: [] });
global.logger = log4js.getLogger();

// Utility function to compress & encode LZMA
function lzmaCompressToBase64 (payload, mode, callback) {
    lzmaWorker.compress(payload, mode,
        function (ints) {
            ints = ints.map(function (c) { return String.fromCharCode(c + 128); }).join('');
            var base64 = Buffer.from(ints, 'binary').toString('base64');
            callback(null, base64);
        },
        function (/* percent */) {
            // console.log("Compressing: " + percent + "%");
        }
    );
}

// Check that the response headers do not request caching
// Throws on failure
function checkNoCache (res) {
    assert.ok(!Object.prototype.hasOwnProperty.call(res.headers, 'x-cache-channel'));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.headers, 'surrogate-key'));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.headers, 'cache-control')); // is this correct ?
    assert.ok(!Object.prototype.hasOwnProperty.call(res.headers, 'last-modified')); // is this correct ?
}

/**
 * Check that the response headers do not request caching
 * @see checkNoCache
 * @param res
 */
function checkCache (res) {
    assert.ok(Object.prototype.hasOwnProperty.call(res.headers, 'x-cache-channel'));
    assert.ok(Object.prototype.hasOwnProperty.call(res.headers, 'cache-control'));
    assert.ok(Object.prototype.hasOwnProperty.call(res.headers, 'last-modified'));
}

function checkSurrogateKey (res, expectedKey) {
    assert.ok(Object.prototype.hasOwnProperty.call(res.headers, 'surrogate-key'));

    function createSet (keys, key) {
        keys[key] = true;
        return keys;
    }
    var keys = res.headers['surrogate-key'].split(' ').reduce(createSet, {});
    var expectedKeys = expectedKey.split(' ').reduce(createSet, {});

    assert.deepStrictEqual(keys, expectedKeys);
}

var uncaughtExceptions = [];
process.on('uncaughtException', function (err) {
    uncaughtExceptions.push(err);
});
beforeEach(function () {
    uncaughtExceptions = [];
});
// global afterEach to capture uncaught exceptions
afterEach(function () {
    assert.strictEqual(
        uncaughtExceptions.length,
        0,
        'uncaughtException:\n\n' + uncaughtExceptions.map(err => err.stack).join('\n\n'));
});

var redisClient;

beforeEach(function () {
    if (!redisClient) {
        redisClient = redis.createClient(global.environment.redis.port);
    }
});

// global afterEach to capture test suites that leave keys in redis
afterEach(function (done) {
    var expectedKeys = {
        'rails:test_windshaft_cartodb_user_1_db:test_table_private_1': true,
        'rails:test_windshaft_cartodb_user_1_db:my_table': true,
        'rails:users:localhost:map_key': true,
        'rails:users:cartodb250user': true,
        'rails:users:localhost': true,
        'api_keys:localhost:1234': true,
        'api_keys:localhost:default_public': true,
        'api_keys:cartodb250user:4321': true,
        'api_keys:cartodb250user:default_public': true,
        'api_keys:localhost:regular1': true,
        'api_keys:localhost:regular2': true
    };
    var databasesTasks = { 0: 'users', 5: 'meta' };

    var keysFound = [];
    function taskDone (err, db, keys) {
        if (err) {
            return done(err);
        }

        delete databasesTasks[db];
        keys.forEach(function (k) {
            if (!expectedKeys[k]) {
                keysFound.push('[db=' + db + ']' + k);
            }
        });

        if (Object.keys(databasesTasks).length === 0) {
            assert.strictEqual(keysFound.length, 0, 'Unexpected keys found in redis: ' + keysFound.join(', '));
            done();
        }
    }

    Object.keys(databasesTasks).forEach(function (db) {
        redisClient.select(db, function () {
            // Check that we start with an empty redis db
            redisClient.keys('*', function (err, keys) {
                return taskDone(err, db, keys);
            });
        });
    });
});

function deleteRedisKeys (keysToDelete, callback) {
    if (Object.keys(keysToDelete).length === 0) {
        return callback();
    }

    function taskDone (k) {
        delete keysToDelete[k];
        if (Object.keys(keysToDelete).length === 0) {
            callback();
        }
    }

    Object.keys(keysToDelete).forEach(function (k) {
        var redisClient = redis.createClient(global.environment.redis.port);
        redisClient.select(keysToDelete[k], function () {
            redisClient.del(k, function (err, deletedKeysCount) {
                assert.ifError(err);
                redisClient.quit();
                assert.notStrictEqual(deletedKeysCount, 0, 'No KEYS deleted for: [db=' + keysToDelete[k] + ']' + k);
                taskDone(k);
            });
        });
    });
}

function rmdirRecursiveSync (dirname) {
    var files = fs.readdirSync(dirname);
    for (var i = 0; i < files.length; ++i) {
        var f = dirname + '/' + files[i];
        var s = fs.lstatSync(f);
        if (s.isFile()) {
            fs.unlinkSync(f);
        } else {
            rmdirRecursiveSync(f);
        }
    }
}

function configureMetadata (action, params, callback) {
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

module.exports = {
    deleteRedisKeys: deleteRedisKeys,
    lzma_compress_to_base64: lzmaCompressToBase64,
    checkNoCache: checkNoCache,
    checkSurrogateKey: checkSurrogateKey,
    checkCache: checkCache,
    rmdirRecursiveSync: rmdirRecursiveSync,
    configureMetadata
};
