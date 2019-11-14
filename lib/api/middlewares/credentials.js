'use strict';

const basicAuth = require('basic-auth');

module.exports = function credentials () {
    return function credentialsMiddleware (req, res, next) {
        const apikeyCredentials = getApikeyCredentialsFromRequest(req);

        res.locals.api_key = apikeyCredentials.token;
        res.locals.basicAuthUsername = apikeyCredentials.username;
        res.set('vary', 'Authorization'); // Honor Authorization header when caching.

        return next();
    };
};

function getApikeyCredentialsFromRequest (req) {
    let apikeyCredentials = {
        token: null,
        username: null
    };

    for (const getter of apikeyGetters) {
        apikeyCredentials = getter(req);
        if (apikeyTokenFound(apikeyCredentials)) {
            break;
        }
    }

    return apikeyCredentials;
}

const apikeyGetters = [
    getApikeyTokenFromHeaderAuthorization,
    getApikeyTokenFromRequestQueryString,
    getApikeyTokenFromRequestBody
];

function getApikeyTokenFromHeaderAuthorization (req) {
    const credentials = basicAuth(req);

    if (credentials) {
        return {
            username: credentials.username,
            token: credentials.pass
        };
    } else {
        return {
            username: null,
            token: null
        };
    }
}

function getApikeyTokenFromRequestQueryString (req) {
    let token = null;

    if (req.query && req.query.api_key) {
        token = req.query.api_key;
    } else if (req.query && req.query.map_key) {
        token = req.query.map_key;
    }

    return {
        username: null,
        token: token
    };
}

function getApikeyTokenFromRequestBody (req) {
    let token = null;

    if (req.body && req.body.api_key) {
        token = req.body.api_key;
    } else if (req.body && req.body.map_key) {
        token = req.body.map_key;
    }

    return {
        username: null,
        token: token
    };
}

function apikeyTokenFound (apikey) {
    return !!apikey && !!apikey.token;
}
