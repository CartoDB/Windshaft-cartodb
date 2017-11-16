'use strict';

const basicAuth = require('basic-auth');
const debug = require('debug')('auth:apikeys:getter');

const getApiKeyFromHeaderAuthorization = req => {
  const credentials = basicAuth(req);
  if (credentials) {
    return {
      username: credentials.name,
      apiKeyToken: credentials.pass,
    };
  } else {
    return {
      username: null,
      apiKeyToken: null,
    };
  }
};
getApiKeyFromHeaderAuthorization.description = 'HTTP header';

const getApiKeyFromQueryParams = req => {
  return { apiKeyToken: req.query.api_key || req.query.map_key };
};
getApiKeyFromQueryParams.description = 'Query params';

const getApiKeyFromBody = req => {
  return { apiKeyToken: req.body && (req.body.api_key || req.body.map_key) }; 
};
getApiKeyFromBody.description = 'Body';

const apiKeyGetters = [
  getApiKeyFromHeaderAuthorization,
  getApiKeyFromQueryParams,
  getApiKeyFromBody,
];

const apiKeyTokenFound = apiKeyToken => !!apiKeyToken;

module.exports = req => {
    let username = null;
    let apiKeyToken = null;

    for(var getter of apiKeyGetters) {
      ({username = null, apiKeyToken = null} = getter(req));
      if (apiKeyTokenFound(apiKeyToken)) {
        break;
      }
    }

  debug(`API key ${apiKeyTokenFound(apiKeyToken) ?
                                 `from ${getter.description}. API key token: ${apiKeyToken}, username: ${username}` :
                                 'not found'}`);

    return {username, apiKeyToken};
};
