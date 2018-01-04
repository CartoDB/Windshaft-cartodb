'use strict';

const basicAuth = require('basic-auth');
const debug = require('debug')('auth:apikeys:getter');

module.exports = function getApiKeyTokenFromRequest(req) {
  let username = null;
  let apiKeyToken = null;

  for (var getter of apiKeyGetters) {
    ({ username = null, apiKeyToken = null } = getter(req));
    if (apiKeyTokenFound(apiKeyToken)) {
      break;
    }
  }

  debug(`API key ${apiKeyTokenFound(apiKeyToken) ?
    `from ${getter.description}. API key token: ${apiKeyToken}, username: ${username}` :
    'not found'}`);

  return { username, apiKeyToken };
};

//--------------------------------------------------------------------------------

function getApiKeyFromHeaderAuthorization (req) {
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

function getApiKeyFromQueryParams (req) {
  return { apiKeyToken: req.query.api_key || req.query.map_key }; //map_key for backward compatibility
}
getApiKeyFromQueryParams.description = 'Query params';

function getApiKeyFromBody (req) {
  return { apiKeyToken: req.body && (req.body.api_key || req.body.map_key) }; //map_key for backward compatibility
}
getApiKeyFromBody.description = 'Body';

const apiKeyGetters = [
  getApiKeyFromHeaderAuthorization,
  getApiKeyFromQueryParams,
  getApiKeyFromBody,
];

function apiKeyTokenFound(apiKeyToken) { 
  return !!apiKeyToken;
}
