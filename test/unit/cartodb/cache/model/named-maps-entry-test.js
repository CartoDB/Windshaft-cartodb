'use strict';

require('../../../../support/test-helper');

var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../../../../../lib/cache/model/named-maps-entry');

describe('cache named maps entry', function() {

    var namedMapOwner = 'foo',
        namedMapName = 'wadus_name',
        namedMapsCacheEntry = new NamedMapsCacheEntry(namedMapOwner, namedMapName),
        entryKey = namedMapsCacheEntry.key();

    it('key is a string', function() {
        assert.ok(_.isString(entryKey));
    });

    it('key is 8 chars length', function() {
        assert.equal(entryKey.length, 8);
        var entryKeyParts = entryKey.split(':');
        assert.equal(entryKeyParts.length, 2);
        assert.equal(entryKeyParts[0], 'n');
    });

    it('key is name spaced for named maps', function() {
        var entryKeyParts = entryKey.split(':');
        assert.equal(entryKeyParts.length, 2);
        assert.equal(entryKeyParts[0], 'n');
    });

});
