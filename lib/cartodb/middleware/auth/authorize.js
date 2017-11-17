'use strict';

const createError = require('http-errors');

const GRANTS_ACCESS = 'grants_access'; //TODO config
const MASTER_TYPE = 'master'; //TODO config

function contextAndApiKeyUsernamesMatch(context) {
  return ( ! context.auth.username) || (context.auth.username === context.user);
}

function fetchApiKeyFromMetadataBackend({metadataBackend, username, apiKeyToken}, callback) {
  return metadataBackend.getApiKey({username, apiKeyToken}, callback);
}

function isMasterApiKey(apiKey) {
  return apiKey.type === MASTER_TYPE;
}

function apiKeyProvided(apiKeyToken) {
  return !!apiKeyToken;
}

function updateContextWithApiKey(authContext, apiKey) {
  authContext.apiKey = apiKey;
}

module.exports = ({metadataBackend}) => {
  function apiKeyGrantsAccessToThisApi(apiKey) {
    return !!apiKey[GRANTS_ACCESS] || isMasterApiKey(apiKey);
  }

  return (req, res, next) => {
    const context = res.locals;
    const apiKeyToken = context.auth.apiKeyToken;
    const username = context.auth.username;

    if ( ! apiKeyProvided(apiKeyToken)) {
      return next(createError(401, 'api-key-required', {type: 'auth', subtype: 'api-key-required'}));
    }

    if ( ! contextAndApiKeyUsernamesMatch(context)) {
      //TODO too much information, sent instead api-key-not-found. IS THIS REALLY NECESARRY?
      return next(createError(401, 'api-key-username-mismatch', {type: 'auth', subtype: 'api-key-mismatch'}));
    }

    fetchApiKeyFromMetadataBackend({metadataBackend, username, apiKeyToken}, (err, apiKey) => {
      if ( err || ! apiKey) {
        return next(createError(401, 
                                'api-key-not-found', 
                                {
                                  type: 'auth', 
                                  subtype: 'api-key-not-found', 
                                  context: {
                                    apiKeyToken
                                  }
                                }));
      }

      if ( ! apiKeyGrantsAccessToThisApi(apiKey)) {
        return next(createError(403, 
                                'api-key-doesnt-grant-access-to-this-api', 
                                {
                                  type: 'auth', 
                                  subtype: 'api-key-doesnt-grant-access-to-this-api',
                                  context: {
                                    apiKey
                                  }
                                }));
      }

      updateContextWithApiKey(context.auth, apiKey);

      next();      
    });
  };
};
