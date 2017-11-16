'use strict';

const createError = require('http-errors');

const GRANTS_API_PREFIX = 'grants_'; //TODO config
const MASTER_TYPE = 'master'; //TODO config

function contextAndApiKeyUsernamesMatch(context) {
  return ( ! context.auth.username) || (context.auth.username === context.user);
}

// function generateRedisKey({username, apiKeyToken}) {
//   return `${REDIS_API_KEYS_HASH_PREFIX}:${username}:${apiKeyToken}`;
// }

function fetchApiKeyFromMetadataBackend({metadataBackend, username, apiKeyToken, apiName}, callback) {
  return metadataBackend.getApiKey({username, apiKeyToken, apiName}, callback);
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

module.exports = ({metadataBackend, apiName}) => {
  const REDIS_FIELD_GRANTS_THIS_API = `${GRANTS_API_PREFIX}${apiName}`;

  function apiKeyGrantsAccessToThisApi(apiKey) {
    return !!apiKey[REDIS_FIELD_GRANTS_THIS_API] || isMasterApiKey(apiKey);
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

    fetchApiKeyFromMetadataBackend({metadataBackend, username, apiKeyToken, apiName}, (err, apiKey) => {
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
