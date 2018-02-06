'use strict';

/*
    Gets an authorization token from the request: named map token or API key token.

    This middleware expects the request's context to be located in res.locals.

    Sets the following fields in the context object:

    auth {
        type
        namedMapToken
        apiKeyToken
        username
    }

    context.user should be set with the user's username

    If the flag allowNamedMap is set to true, a Named Map auth token is going to be searched
    in the request.

    If the flag useDefaultApiKey is set to true, in case no authorization token were found,
    the default API key token will be used.
*/

const getApiKeyTokenFromRequest = require('./lib/get_api_key_token_from_request.js');
// const getLayergroupTokenFromContext = require('./lib/get_layergroup_token_from_context.js');

module.exports = ({ allowNamedMap = false, useDefaultApiKey = false }) =>
    function getAuthorizationTokenMiddleware(req, res, next) {
        const context = res.locals;
        var namedMapTokenExtractedFromRequest = false;

        if (allowNamedMap) {
            namedMapTokenExtractedFromRequest = setAuthContextWithNamedMap(context);
        }

        if ( ! namedMapTokenExtractedFromRequest) {
            let { username = null, apiKeyToken = null } = getApiKeyTokenFromRequest(req);
            let apiKeyProvided = true;

            if ( ! apiKeyToken && useDefaultApiKey) {
                apiKeyProvided = false;
                ({ username, apiKeyToken } = getDefaultPublicApiKeyToken(context));
            }

            if (apiKeyToken) {
                setAuthContextWithApiKey(context.auth, { username, apiKeyToken, apiKeyProvided });
            } else {
                setNoAuthProvided(context.auth);
            }
        }

        context.auth.isNamedMapAuth = function isNamedMapAuth() {
            return this.type === NAMED_MAP;
        }.bind(context.auth);

        context.auth.isApiKeyAuth = function isApiKeyAuth() {
            return this.type === API_KEY;
        }.bind(context.auth);

        next();
    };

//-----------------------------------------------------------------------------

const DEFAULT_API_KEY_ID = 'default_public'; //TODO config
const NAMED_MAP = 'namedMap'; //TODO config
const API_KEY = 'apiKey'; //TODO config

function setAuthContextWithNamedMap(context) {
    const authContext = context.auth;
    let namedMapTokenExtractedFromRequest = false;

    authContext.type = NAMED_MAP;
    authContext.namedMapToken = {
        token: context.token,
        signer: context.signer,
        cache_buster: context.cache_buster
    };

    namedMapTokenExtractedFromRequest = true;

    return namedMapTokenExtractedFromRequest;
}

function setAuthContextWithApiKey(authContext, { username, apiKeyToken, apiKeyProvided }) {
    authContext.type = API_KEY;
    authContext.apiKeyToken = apiKeyToken;
    authContext.username = username;
    authContext.apiKeyProvided = apiKeyProvided;
}

function setNoAuthProvided(authContext) {
    authContext.noAuthProvided = true;
}

function getDefaultPublicApiKeyToken(context) {
    return {
        username: context.user,
        apiKeyToken: DEFAULT_API_KEY_ID
    };
}
