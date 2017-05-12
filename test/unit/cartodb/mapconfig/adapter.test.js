//require('../../../support/test_helper');
var assert = require('assert');

var MapConfigAdapter = require('../../../../lib/cartodb/models/mapconfig/map-config-adapter');

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

    function createAdapter(valOperatorFn) {
        return function ValMapConfigAdapter() {
            this.getMapConfig = function(user, requestMapConfig, params, context, callback) {
                requestMapConfig.val = valOperatorFn(requestMapConfig.val);
                return callback(null, requestMapConfig);
            };
        };
    }
    var IncValMapConfigAdapter = createAdapter(function(val) { return val + 1; });
    var Mul2ValMapConfigAdapter = createAdapter(function(val) { return val * 2; });

    function validateMapConfig(adapter, expectedNumAdapters, expectedVal, callback) {
        assert.equal(adapter.adapters.length, expectedNumAdapters);
        adapter.getMapConfig(user, requestMapConfig(), params(), context(), function(err, mapConfig) {
            assert.equal(mapConfig.val, expectedVal);
            return callback(err);
        });
    }

    it('works with no adapters', function(done) {
        var adapter = new MapConfigAdapter();
        validateMapConfig(adapter, 0, 0, done);
    });

    it('works with no adapters as empty array', function(done) {
        var adapter = new MapConfigAdapter([]);
        validateMapConfig(adapter, 0, 0, done);
    });

    it('works with basic adapter', function(done) {
        var adapter = new MapConfigAdapter(new IncValMapConfigAdapter());
        validateMapConfig(adapter, 1, 1, done);
    });

    it('works with basic adapter as array', function(done) {
        var adapter = new MapConfigAdapter([new IncValMapConfigAdapter()]);
        validateMapConfig(adapter, 1, 1, done);
    });

    it('works with several adapters', function(done) {
        var adapter = new MapConfigAdapter(new IncValMapConfigAdapter(), new IncValMapConfigAdapter());
        validateMapConfig(adapter, 2, 2, done);
    });

    it('works with several adapters as array', function(done) {
        var adapter = new MapConfigAdapter([new IncValMapConfigAdapter(), new IncValMapConfigAdapter()]);
        validateMapConfig(adapter, 2, 2, done);
    });

    it('should execute in order 1', function(done) {
        var adapter = new MapConfigAdapter([new Mul2ValMapConfigAdapter(), new IncValMapConfigAdapter()]);
        validateMapConfig(adapter, 2, 1, done);
    });

    it('should execute in order 2', function(done) {
        var adapter = new MapConfigAdapter([new IncValMapConfigAdapter(), new Mul2ValMapConfigAdapter()]);
        validateMapConfig(adapter, 2, 2, done);
    });

    it('should execute in order 3', function(done) {
        var adapter = new MapConfigAdapter([new Mul2ValMapConfigAdapter(), new Mul2ValMapConfigAdapter()]);
        validateMapConfig(adapter, 2, 0, done);
    });

    it('should execute in order 4', function(done) {
        var Mul5ValMapConfigAdapter = createAdapter(function(val) { return val * 5; });
        var adapter = new MapConfigAdapter(
            new IncValMapConfigAdapter(),
            new Mul2ValMapConfigAdapter(),
            new Mul5ValMapConfigAdapter()
        );
        validateMapConfig(adapter, 3, 10, done);
    });
});
