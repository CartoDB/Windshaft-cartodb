'use strict';

const uuid = require('uuid');

module.exports = function initLogger ({ logger }) {
    return function initLoggerMiddleware (req, res, next) {
        const id = req.get('X-Request-Id') || uuid.v4();
        res.locals.logger = logger.child({ id });

        res.locals.logger.info({ request: req });
        res.on('finish', () => res.locals.logger.info({ response: res }));
        res.on('close', () => res.locals.logger.info({ end: true }));

        next();
    };
};
