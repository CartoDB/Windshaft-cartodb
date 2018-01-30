'use strict';

const initAuthContext = require('./init_context');
const getAuthorizationToken = require('./get_authorization_token');
const authorize = require('./authorize');

/*

  res.locals.auth = {
    username
    type: string - ['apiKey', 'namedMap']
    namedMapToken
    apiKeyToken
    apiKey
  }

*/

function AuthMiddleware({
  metadataBackend,
  allowNamedMap = false,
  useDefaultApiKey = true,
  mapStore = null,
  templateMaps = null }) {
  return [
    initAuthContext(),
    getAuthorizationToken({ allowNamedMap, useDefaultApiKey }),
    authorize({ metadataBackend, mapStore, templateMaps }),
  ];
}

module.exports = AuthMiddleware;
