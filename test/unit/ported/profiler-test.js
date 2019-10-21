'use strict';

require('../../support/test-helper');

var assert = require('assert');
var ProfilerProxy = require('../../../lib/stats/profiler-proxy');

describe('profiler', function () {
    it('Profiler is null in ProfilerProxy when profiling is not enabled', function () {
        var profilerProxy = new ProfilerProxy({ profile: false });
        assert.strictEqual(profilerProxy.profiler, null);
    });

    it('Profiler is NOT null in ProfilerProxy when profiling is enabled', function () {
        var profilerProxy = new ProfilerProxy({ profile: true });
        assert.notStrictEqual(profilerProxy.profiler, null);
    });
});
