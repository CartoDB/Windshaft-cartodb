const Profiler = require('../stats/profiler_proxy');
const debug = require('debug')('windshaft:cartodb:stats');
const methods = ['send', 'json', 'jsonp'];

module.exports = function statsMiddleware(options) {
    const { enabled = true, statsClient } = options;

    return function stats(req, res, next) {
        req.profiler = new Profiler({
            statsd_client: statsClient,
            profile: enabled
        });

        methods.forEach((method) => {
            const originalFn = res[method];

            res[method] = function (body) {
                res.set('X-Tiler-Profiler', req.profiler.toJSONString());

                originalFn.call(this, body);

                try {
                    // May throw due to dns, see: http://github.com/CartoDB/Windshaft/issues/166
                    req.profiler.sendStats();
                } catch (err) {
                    debug("error sending profiling stats: " + err);
                }
            };
        });

        next();
    };
};