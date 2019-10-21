'use strict';

require('../../../support/test-helper');

var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../../../../lib/cache/model/named-maps-entry');

describe('cache named maps entry', function () {
    var namedMapOwner = 'foo';
    var namedMapName = 'wadus_name';
    var namedMapsCacheEntry = new NamedMapsCacheEntry(namedMapOwner, namedMapName);
    var entryKey = namedMapsCacheEntry.key();

    it('key is a string', function () {
        assert.ok(_.isString(entryKey));
    });

    it('key is 8 chars length', function () {
        assert.strictEqual(entryKey.length, 8);
        var entryKeyParts = entryKey.split(':');
        assert.strictEqual(entryKeyParts.length, 2);
        assert.strictEqual(entryKeyParts[0], 'n');
    });

    it('key is name spaced for named maps', function () {
        var entryKeyParts = entryKey.split(':');
        assert.strictEqual(entryKeyParts.length, 2);
        assert.strictEqual(entryKeyParts[0], 'n');
    });
});
