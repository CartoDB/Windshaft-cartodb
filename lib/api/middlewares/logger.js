'use strict';

const uuid = require('uuid');

module.exports = function logger () {
    return function loggerMiddleware (req, res, next) {
        const id = req.get('X-Request-Id') || uuid.v4();
        const logger = res.locals.logger = global.logger.child({ id });

        logger.info(req);
        res.on('finish', () => logger.info(res));

        next();
    };
};
