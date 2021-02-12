'use strict';

const uuid = require('uuid');

module.exports = function initLogger ({ logger }) {
    return function initLoggerMiddleware (req, res, next) {
        res.locals.logger = logger.child({ request_id: req.get('X-Request-Id') || uuid.v4(), 'cdb-user': res.locals.user });
        res.locals.logger.info({ client_request: req }, 'Incoming request');
        res.on('finish', () => res.locals.logger.info({ server_response: res, status: res.statusCode }, 'Response sent'));
        res.on('close', () => res.locals.logger.info({ end: true }, 'Request done'));
        next();
    };
};
