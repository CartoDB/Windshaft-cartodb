require('../../../../support/test_helper');

var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../../../../../lib/cartodb/cache/model/named_maps_entry');

suite('cache named_maps_entry', function() {

    var namedMapOwner = 'foo',
        namedMapName = 'wadus_name',
        namedMapsCacheEntry = new NamedMapsCacheEntry(namedMapOwner, namedMapName),
        entryKey = namedMapsCacheEntry.key();

    test('key is a string', function() {
        assert.ok(_.isString(entryKey));
    });

    test('key is 8 chars length', function() {
        assert.equal(entryKey.length, 8);
        var entryKeyParts = entryKey.split(':');
        assert.equal(entryKeyParts.length, 2);
        assert.equal(entryKeyParts[0], 'n');
    });

    test('key is name spaced for named maps', function() {
        var entryKeyParts = entryKey.split(':');
        assert.equal(entryKeyParts.length, 2);
        assert.equal(entryKeyParts[0], 'n');
    });

});
