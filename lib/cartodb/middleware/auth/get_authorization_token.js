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
const getNamedMapTokenFromContext = require('./lib/get_named_map_token_from_context.js');

module.exports = ({ allowNamedMap = false, useDefaultApiKey = false }) =>
    function getAuthorizationTokenMiddleware(req, res, next) {
        const context = res.locals;
        var namedMapTokenExtractedFromRequest = false;

        if (allowNamedMap) {
            const namedMapToken = getNamedMapTokenFromContext(context);
            if (namedMapToken) {
                setAuthContextWithNamedMap(context, { namedMapToken });
                namedMapTokenExtractedFromRequest = true;
            }
        }

        if ( ! namedMapTokenExtractedFromRequest) {
            let { username = null, apiKeyToken = null } = getApiKeyTokenFromRequest(req);
            if ( ! apiKeyToken && useDefaultApiKey) {
                ({ username, apiKeyToken } = getDefaultPublicApiKeyToken(context));
            }

            if (apiKeyToken) {
                setAuthContextWithApiKey(context.auth, { username, apiKeyToken });
            } else {
                setNoAuthProvided(context.auth);
            }
        }

        context.auth.isNamedMapAuth = isNamedMapAuth;
        context.auth.isApiKeyAuth = isApiKeyAuth;

        next();
    };

//-----------------------------------------------------------------------------

const DEFAULT_API_KEY_ID = 'default_public'; //TODO config
const NAMED_MAP = 'namedMap'; //TODO config
const API_KEY = 'apiKey'; //TODO config

function setAuthContextWithNamedMap(context, { namedMapToken }) {
    const authContext = context.auth;
    
    authContext.type = NAMED_MAP;
    authContext.namedMapToken = namedMapToken;

    // TODO this data is duplicated. 
    context.token = namedMapToken.token;
    context.cache_buster = namedMapToken.cache_buster;
    if (namedMapToken.signer) {
        context.signer = namedMapToken.signer;        
    }
}

function setAuthContextWithApiKey(authContext, { username, apiKeyToken }) {
    authContext.type = API_KEY;
    authContext.apiKeyToken = apiKeyToken;
    authContext.username = username;
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

function isNamedMapAuth() {
    return this.type === NAMED_MAP;
}

function isApiKeyAuth() {
    return this.type === API_KEY;
}