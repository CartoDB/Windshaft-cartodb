'use strict';

const uuid = require('uuid');

module.exports = function logger () {
    return function loggerMiddleware (req, res, next) {
        const id = req.get('X-Request-Id') || uuid.v4();
        res.locals.logger = global.logger.child({ id });

        res.locals.logger.info(req);
        res.on('finish', () => res.locals.logger.info(res));

        next();
    };
};
