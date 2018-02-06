'use strict';

const createError = require('http-errors');

const GRANTS_ACCESS = 'grantsMaps'; //TODO config
const MASTER_TYPE = 'master'; //TODO config

module.exports = ({ metadataBackend, mapStore, templateMaps}) => {
  return function authorizeMiddleware(req, res, next) {

    authorizeWithApiKey({ context: res.locals, metadataBackend }, (err, authorized, errorCode) => {
      if (err) {
        return next(err);
      }

      if (!authorized && !errorCode) {
        const options = {
          context: res.locals,
          metadataBackend,
          mapStore,
          templateMaps,
          isJsonp: req.query && req.query.callback
        };

        if (!res.locals.signer) {
          return next();
        }

        return authorizeWithSigner(options, (err, authorized) => {
          if (err) {
            return next(err);
          }

          if (!authorized) {
            return next(createError(403, 'permission denied'));
          }

          next();
        });
      }

      if (errorCode) {
        return next(createError(errorCode, { type: 'auth' }));
      }

      next();
    });
  };
};

//-----------------------------------------------------------------------------


function authorizeWithApiKey({ context, metadataBackend }, callback) {
  const { apiKeyToken, apiKeyProvided } = context.auth;
  const username = context.user;

  if (!apiKeyProvided) {
    return callback(null, false);
  }

  // if (!apiKeyProvided(apiKeyToken)) {
  //   return callback(createError(401, 'api-key-required', { type: 'auth', subtype: 'api-key-required' }));
  // }

  // if (!contextAndApiKeyUsernamesMatch(context)) {
  //   //TODO too much information, sent instead api-key-not-found. IS THIS REALLY NECESARRY?
  //   return callback(createError(401, 'api-key-username-mismatch', { type: 'auth', subtype: 'api-key-mismatch' }));
  // }

  fetchApiKeyFromMetadataBackend({ metadataBackend, username, apiKeyToken }, (err, apiKey) => {
    if (err) {
      return callback(err);
    }

    if (!apiKey) {
      return callback(null, false, 401);
    }

    if (!apiKeyGrantsAccessToThisApi(apiKey)) {
      return callback(null, false);
    }

    updateContextWithApiKey(context, apiKey);

    callback(null, true);
  });
}

function contextAndApiKeyUsernamesMatch(context) {
  return ( ! context.auth.username) || (context.auth.username === context.user);
}

function fetchApiKeyFromMetadataBackend({ metadataBackend, username, apiKeyToken = 'default_public' }, callback) {
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


function authorizeWithSigner({ context, mapStore, templateMaps, isJsonp = false }, callback) {
  const layergroup_id = context.token;
  const auth_token = context.auth_token;

  isAuthTokenAuthorized(templateMaps, mapStore, layergroup_id, auth_token, (err, authorized) => {
    if (err) {
      return callback(err);
    }

    if (!authorized) {
      return callback(null, authorized);
    }

    updateContextWithNamedMapToken(context.auth);

    return callback(null, authorized);
  });
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

function updateContextWithNamedMapToken(authContext) {
  authContext.authorizedByNamedMapToken = true;
}
