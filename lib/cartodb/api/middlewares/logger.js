'use strict';

module.exports = function logger (options) {
    if (!global.log4js || !options.log_format) {
        return function dummyLoggerMiddleware (req, res, next) {
            next();
        };
    }

    const opts = {
        level: 'info',
        // Allowing for unbuffered logging is mainly
        // used to avoid hanging during unit testing.
        // TODO: provide an explicit teardown function instead,
        //       releasing any event handler or timer set by
        //       this component.
        buffer: !options.unbuffered_logging,
        // optional log format
        format: options.log_format
    };
    const logger = global.log4js.getLogger();

    return global.log4js.connectLogger(logger, opts);
};
