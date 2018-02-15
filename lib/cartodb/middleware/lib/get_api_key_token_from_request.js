'use strict';

const basicAuth = require('basic-auth');

module.exports = function getApiKeyTokenFromRequest(req) {
    let apiKeyToken = null;

    for (var getter of apiKeyGetters) {
        apiKeyToken = getter(req);
        if (apiKeyTokenFound(apiKeyToken)) {
            break;
        }
    }

    return apiKeyToken;
};

//--------------------------------------------------------------------------------

const apiKeyGetters = [
    getApikeyTokenFromHeaderAuthorization,
    getApikeyTokenFromRequestQueryString,
    getApikeyTokenFromRequestBody,
];

function getApikeyTokenFromHeaderAuthorization(req) {
    const credentials = basicAuth(req);
    
    if (credentials) {
        return credentials.pass;
    } else {
        return null;
    }
}

function getApikeyTokenFromRequestQueryString(req) {
    if (req.query && req.query.api_key) {
        return req.query.api_key;
    }

    if (req.query && req.query.map_key) {
        return req.query.map_key;
    }

    return null;
}

function getApikeyTokenFromRequestBody(req) {
    if (req.body && req.body.api_key) {
        return req.body.api_key;
    }

    if (req.body && req.body.map_key) {
        return req.body.map_key;
    }

    return null;
}

function apiKeyTokenFound(apiKeyToken) {
    return !!apiKeyToken;
}
