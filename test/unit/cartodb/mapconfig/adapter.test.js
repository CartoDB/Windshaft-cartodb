//require('../../../support/test_helper');
var assert = require('assert');

var MapConfigAdapter = require('../../../../lib/cartodb/models/mapconfig/adapter');

describe('MapConfigAdapter', function() {
    var user = 'wadus';
    function requestMapConfig() {
        return {
            val: 0
        };
    }
    function params() {
        return {};
    }
    function context() {
        return {};
    }

    function IncValMapConfigAdapter() {
        this.getMapConfig = function(user, requestMapConfig, params, context, callback) {
            requestMapConfig.val += 1;
            return callback(null, requestMapConfig);
        };
    }

    function validateMapConfig(adapter, expectedNumAdapters, validatorFn, callback) {
        assert.equal(adapter.adapters.length, expectedNumAdapters);
        adapter.getMapConfig(user, requestMapConfig(), params(), context(), function(err, mapConfig) {
            validatorFn(mapConfig);
            return callback(err);
        });
    }

    it('works with no adapters', function(done) {
        var adapter = new MapConfigAdapter();
        validateMapConfig(adapter, 0, function(mapConfig) {
            assert.equal(mapConfig.val, 0);
        }, done);
    });

    it('works with no adapters as empty array', function(done) {
        var adapter = new MapConfigAdapter([]);
        validateMapConfig(adapter, 0, function(mapConfig) {
            assert.equal(mapConfig.val, 0);
        }, done);
    });

    it('works with basic adapter', function(done) {
        var adapter = new MapConfigAdapter(new IncValMapConfigAdapter());
        validateMapConfig(adapter, 1, function(mapConfig) {
            assert.equal(mapConfig.val, 1);
        }, done);
    });

    it('works with basic adapter as array', function(done) {
        var adapter = new MapConfigAdapter([new IncValMapConfigAdapter()]);
        validateMapConfig(adapter, 1, function(mapConfig) {
            assert.equal(mapConfig.val, 1);
        }, done);
    });

    it('works with several adapters', function(done) {
        var adapter = new MapConfigAdapter(new IncValMapConfigAdapter(), new IncValMapConfigAdapter());
        validateMapConfig(adapter, 2, function(mapConfig) {
            assert.equal(mapConfig.val, 2);
        }, done);
    });

    it('works with several adapters as array', function(done) {
        var adapter = new MapConfigAdapter([new IncValMapConfigAdapter(), new IncValMapConfigAdapter()]);
        validateMapConfig(adapter, 2, function(mapConfig) {
            assert.equal(mapConfig.val, 2);
        }, done);
    });
});
