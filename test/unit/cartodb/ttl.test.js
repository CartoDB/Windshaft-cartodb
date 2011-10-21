
var assert = require('assert')
  , _ = require('underscore')
  , TTL = require('../../../lib/cartodb/ttl')
  , tests = module.exports = {};


tests['all ok'] = function() {
    assert.ok(true, "ok");
}

tests['should timeout'] = function() {
    var called = false;
    var ttl = TTL(function() {
        called = true;
    }, 0.1);
    ttl.start('test');
    setTimeout(function() {
        assert.ok(called === true, "called");
    }, 200);
}

tests['should remove timeout'] = function() {
    var called = false;
    var ttl = TTL(function() {
        called = true;
    }, 0.1);
    ttl.start('test');
    ttl.remove('test');
    setTimeout(function() {
        assert.ok(called === false, "removed");
    }, 200);
}

tests['should renew timeout time'] = function() {
    var called = false;
    var ttl = TTL(function() {
        called = true;
    }, 0.3);
    ttl.start('test');
    setTimeout(function() {
        ttl.start('test');
    }, 0.5);
    setTimeout(function() {
        assert.ok(called === false, "removed");
    }, 300);
    setTimeout(function() {
        assert.ok(called === true, "removed");
    }, 600);
}
