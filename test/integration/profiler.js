require('../support/test_helper');

var assert = require('assert');
var StatsClient = require('../../lib/cartodb/stats/client');
var ProfilerProxy = require('../../lib/cartodb/stats/profiler_proxy');

describe('profiler + statsd', function() {
    var statsInstance;

    before(function() {
        statsInstance = StatsClient.instance;
        StatsClient.instance = null;
    });

    after(function() {
        StatsClient.instance = statsInstance;
    });

    var statsdConfig = {
        host: 'whoami.vizzuality.com',
        port: 8125,
        prefix: 'test.',
        cacheDns: false
        // support all allowed node-statsd options
    };

    // See https://github.com/CartoDB/Windshaft/issues/167
    it('profiler does not throw uncaught exception on invalid host/port', function(done) {

        var statsClient = StatsClient.getInstance(statsdConfig);
        var profiler = new ProfilerProxy({profile: true, statsd_client: statsClient});

        profiler.start('test');
        profiler.done('wadus');
        profiler.end();

        profiler.sendStats();

        // force a call to validate sendStats does not throw and uncaught exception
        statsClient.timing('forced', 50, 1, function(err) {
            assert.ok(err);
            assert.equal(err.code, 'ENOTFOUND');
            done();
        });
    });
});
