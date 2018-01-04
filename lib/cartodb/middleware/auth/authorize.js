'use strict';

const createError = require('http-errors');

const GRANTS_ACCESS = 'grants_access'; //TODO config
const MASTER_TYPE = 'master'; //TODO config

module.exports = ({ metadataBackend, mapStore, templateMaps }) => {
  return function AuthorizeMiddleware(req, res, next) {
    const auth = res.locals.auth;

    if (auth.isApiKeyAuth()) {
      authorizeWithApiKey({context: res.locals, metadataBackend}, next);
    } else if (auth.isNamedMapAuth()) {
      authorizeWithNamedMapToken({ context: res.locals, metadataBackend }, next);
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

  console.log(apiKeyToken); //TODO remove
  fetchApiKeyFromMetadataBackend({ metadataBackend, username, apiKeyToken }, (err, apiKey) => {
    console.log(apiKey)
    if (err || !apiKey) {
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
    updateContextWithApiKey(context.auth, apiKey);

    next();
  });
}

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
  authContext.authorizedByApiKey = true;
}

function apiKeyGrantsAccessToThisApi(apiKey) {
  return !!apiKey[GRANTS_ACCESS] || isMasterApiKey(apiKey);
}


function authorizeWithNamedMapToken({ context, mapStore, templateMaps }, next) {
  if ( ! context.signer) {
    context.signer = context.user;
  } else if (context.signer !== context.user) {
    var err = new Error(`Cannot use map signature of user "${context.signer}" on db of user "${user}"`);
    err.type = 'auth';
    err.http_status = 403;
    // TODO handle this case
    // if (req.query && req.query.callback) {
    //   err.http_status = 200;
    // }

    // req.profiler.done('req2params');
    return next(err);
  }

  const layergroup_id = context.token;
  const auth_token = context.auth_token; //TODO what's this

  mapStore.load(layergroup_id, function (err, mapConfig) {
    if (err) {
      return next(err);
    }

    const authorized = templateMaps.isAuthorized(mapConfig.obj().template, auth_token);

    if (authorized) {
      updateContextWithWithNamedMapToken(context.auth)
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


function updateContextWithWithNamedMapToken(authContext) {
  authContext.authorizedByNamedMapToken = true;
}
