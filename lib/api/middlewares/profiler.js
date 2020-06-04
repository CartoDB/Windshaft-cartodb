'use strict';

const Profiler = require('../../stats/profiler-proxy');
const debug = require('debug')('windshaft:cartodb:stats');

module.exports = function profiler (options) {
    const { enabled = true, statsClient } = options;

    return function profilerMiddleware (req, res, next) {
        const { logger } = res.locals;
        const { id } = logger.bindings();

        // TODO: stop using profiler and log stats instead of adding them to the profiler
        req.profiler = new Profiler({
            statsd_client: statsClient,
            profile: enabled
        });

        req.profiler.start(id);

        res.on('finish', () => {
            req.profiler.done('response');
            logger.info({ stats: req.profiler.toJSON() });

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
