'use strict';

const Profiler = require('../../stats/profiler-proxy');
const debug = require('debug')('windshaft:cartodb:stats');
const onHeaders = require('on-headers');

module.exports = function stats (options) {
    const { enabled = true, statsClient } = options;

    return function statsMiddleware (req, res, next) {
        req.profiler = new Profiler({
            statsd_client: statsClient,
            profile: enabled
        });

        onHeaders(res, () => res.set('X-Tiler-Profiler', req.profiler.toJSONString()));

        res.on('finish', () => {
            try {
                // May throw due to dns, see: http://github.com/CartoDB/Windshaft/issues/166
                req.profiler.sendStats();
            } catch (err) {
                debug('error sending profiling stats: ' + err);
            }
        });

        next();
    };
};
