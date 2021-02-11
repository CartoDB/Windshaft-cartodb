'use strict';

var assert = require('assert');
var fs = require('fs');
var LZMA = require('lzma').LZMA;

var lzmaWorker = new LZMA();

var redis = require('redis');
const setICUEnvVariable = require('../../lib/utils/icu-data-env-setter');

// set environment specific variables

let configFileName = process.env.NODE_ENV;
if (process.env.CARTO_WINDSHAFT_ENV_BASED_CONF) {
    // we override the file with the one with env vars
    configFileName = 'config';
}

global.environment = require(`../../config/environments/${configFileName}.js`);
process.env.NODE_ENV = 'test';

setICUEnvVariable();

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

const expectedKeys = { 0: [], 5: [] };

before(async () => {
    const { host, port } = global.environment.redis;
    const client = redis.createClient({ host, port });

    for (const db of Object.keys(expectedKeys)) {
        await new Promise((resolve, reject) => client.select(db, (err) => err ? reject(err) : resolve()));
        const keys = await new Promise((resolve, reject) => client.keys('*', (err, keys) => err ? reject(err) : resolve(keys)));
        expectedKeys[db].push(...keys);
    }

    await new Promise((resolve, reject) => client.quit((err) => err ? reject(err) : resolve()));
});

afterEach(async () => {
    const { host, port } = global.environment.redis;
    const client = redis.createClient({ host, port });

    const foundKeys = { 0: [], 5: [] };
    for (const db of Object.keys(expectedKeys)) {
        await new Promise((resolve, reject) => client.select(db, (err) => err ? reject(err) : resolve()));
        const keys = await new Promise((resolve, reject) => client.keys('*', (err, keys) => err ? reject(err) : resolve(keys)));
        foundKeys[db].push(...keys);
    }

    const unexpectedKeys = { 0: [], 5: [] };
    for (const db of Object.keys(expectedKeys)) {
        unexpectedKeys[db] = foundKeys[db].filter(key => !expectedKeys[db].includes(key));
        unexpectedKeys[db] = foundKeys[db].filter(key => !expectedKeys[db].includes(key));
    }

    for (const db of Object.keys(unexpectedKeys)) {
        if (unexpectedKeys[db].length > 0) {
            await new Promise((resolve, reject) => client.select(db, (err) => err ? reject(err) : resolve()));
            await new Promise((resolve, reject) => client.del(unexpectedKeys[db], (err, keys) => err ? reject(err) : resolve(keys)));
        }
    }

    await new Promise((resolve, reject) => client.quit((err) => err ? reject(err) : resolve()));

    assert.deepStrictEqual(unexpectedKeys, { 0: [], 5: [] }, 'Unexpected keys in Redis found');
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
        const { host, port } = global.environment.redis;
        const client = redis.createClient({ host, port });

        client.select(keysToDelete[k], function () {
            client.del(k, function (err, deletedKeysCount) {
                assert.ifError(err);
                client.quit();
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
    const { host, port } = global.environment.redis;
    const client = redis.createClient({ host, port });

    client.SELECT(5, function (err) {
        if (err) {
            return callback(err);
        }

        client[action](params, function (err) {
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
