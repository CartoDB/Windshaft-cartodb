'use strict';

const getApikeyTokenFromRequest = require('../lib/get_api_key_token_from_request');

module.exports = () => function apikeyTokenMiddleware(req, res, next) {
    res.locals.api_key = getApikeyTokenFromRequest(req);
    return next();
};
