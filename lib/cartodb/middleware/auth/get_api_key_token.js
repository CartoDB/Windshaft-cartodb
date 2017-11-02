'use strict';

const getApiKeyTokenFromRequest = require('./lib/get_api_key_token_from_request.js');

const DEFAULT_API_KEY_ID = 'default-public'; //TODO config

function updateContextWithApiKeyInfo(authContext, {username, apiKeyToken}) {
  authContext.apiKeyToken = apiKeyToken;
  authContext.username = username;
}

function getDefaultPublicApiKeyToken(context) {
  return {
    username: context.user,
    apiKeyToken: DEFAULT_API_KEY_ID
  };
}

module.exports = () => {
  return (req, res, next) => {
    const context = res.locals;

    let {username = null, apiKeyToken = null} = getApiKeyTokenFromRequest(req);

    if ( ! apiKeyToken) {
      ({username, apiKeyToken} = getDefaultPublicApiKeyToken(context));
    }

    updateContextWithApiKeyInfo(context.auth, {username, apiKeyToken});

    next();      
  };
};
