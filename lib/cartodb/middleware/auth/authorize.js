'use strict';

const createError = require('http-errors');

const GRANTS_ACCESS = 'grantsMaps'; //TODO config
const MASTER_TYPE = 'master'; //TODO config

module.exports = ({ metadataBackend, mapStore, templateMaps}) => {
  return function authorizeMiddleware(req, res, next) {
    const auth = res.locals.auth;

    if (auth.isApiKeyAuth()) {
      authorizeWithApiKey({
        context: res.locals,
        metadataBackend
      }, next);
    } else if (auth.isNamedMapAuth()) {
      authorizeWithNamedMapToken({
        context: res.locals,
        metadataBackend,
        mapStore,
        templateMaps,
        isJsonp: req.query && req.query.callback
      }, next);
    }
  };
};

//-----------------------------------------------------------------------------


function authorizeWithApiKey({ context, metadataBackend }, next) {
  const apiKeyToken = context.auth.apiKeyToken;
  const username = context.user;

  if (!apiKeyProvided(apiKeyToken)) {
    return next(createError(401, 'api-key-required', { type: 'auth', subtype: 'api-key-required' }));
  }

  if (!contextAndApiKeyUsernamesMatch(context)) {
    //TODO too much information, sent instead api-key-not-found. IS THIS REALLY NECESARRY?
    return next(createError(401, 'api-key-username-mismatch', { type: 'auth', subtype: 'api-key-mismatch' }));
  }

  fetchApiKeyFromMetadataBackend({ metadataBackend, username, apiKeyToken }, (err, apiKey) => {
    if (err || !apiKey) {
      return next(createError(401,
        {
          type: 'auth',
          subtype: 'api-key-not-found',
          context: {
            apiKeyToken
          }
        }));
    }

    if (!apiKeyGrantsAccessToThisApi(apiKey)) {
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

    updateContextWithApiKey(context, apiKey);

    next();
  });
}

function contextAndApiKeyUsernamesMatch(context) {
  return ( ! context.auth.username) || (context.auth.username === context.user);
}

function fetchApiKeyFromMetadataBackend({ metadataBackend, username, apiKeyToken}, callback) {
  return metadataBackend.getApiKey(username, apiKeyToken, 'maps', callback);
}

function isMasterApiKey(apiKey) {
  return apiKey.type === MASTER_TYPE;
}

function apiKeyProvided(apiKeyToken) {
  return !!apiKeyToken;
}

function updateContextWithApiKey(context, apiKey) {
  context.auth.apiKey = apiKey;
  context.auth.authorizedByApiKey = true;
}

function apiKeyGrantsAccessToThisApi(apiKey) {
  return !!apiKey[GRANTS_ACCESS] || isMasterApiKey(apiKey);
}


function authorizeWithNamedMapToken({ context, mapStore, templateMaps, isJsonp = false }, next) {
  if ( ! context.signer) {
    context.signer = context.user;
  } else if (context.signer !== context.user) {
    var err = new Error(`Cannot use map signature of user "${context.signer}" on db of user "${context.user}"`);
    err.type = 'auth';
    err.http_status = isJsonp ? 200 : 403;

    return next(err);
  }

  const layergroup_id = context.token;
  const auth_token = context.auth_token;

  isAuthTokenAuthorized(templateMaps, mapStore, layergroup_id, auth_token, (err, authorized) => {
    if (err) {
      return next(err);
    }

    if (authorized) {
      updateContextWithWithNamedMapToken(context.auth);
      return next();
    } else {
      return next(createError(403,
        'named-map-token-error',
        {
          type: 'auth',
          subtype: 'context.token',
          context: {
            token: context.token
          }
        }));
    }
  });

  return next();
}

function isAuthTokenAuthorized(templateMaps, mapStore, layergroup_id, auth_token, callback) {
  mapStore.load(layergroup_id, function (err, mapConfig) {
    if (err) {
      return callback(err);
    }

    const authorized = templateMaps.isAuthorized(mapConfig.obj().template, auth_token);

    callback(null, authorized);
  });
}

function updateContextWithWithNamedMapToken(authContext) {
  authContext.authorizedByNamedMapToken = true;
}
