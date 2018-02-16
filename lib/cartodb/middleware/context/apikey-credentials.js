'use strict';

const getApikeyCredentialsFromRequest = require('../lib/get_api_key_credentials_from_request');

module.exports = () => function apikeyTokenMiddleware(req, res, next) {
    const apikeyCredentials = getApikeyCredentialsFromRequest(req);
    res.locals.api_key = apikeyCredentials.token;
    res.locals.apikeyUsername = apikeyCredentials.username;
    return next();
};
