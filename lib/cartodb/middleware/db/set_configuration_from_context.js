'use strict';

/*
  Sets the context database object (db) with the following database connection params.

  db {
    host,
    name,
    port
    masterUser,
    masterPassword,
    user,
    password,
  }

  This middleware expects the request's context to be located in res.locals.
  
  Gathers information from the following context properties:
  
  userContext.metadata
    - database_host
    - database_name
    - database_port [OPTIONAL]
    - database_master_role
    - database_master_password

  auth

  auth.apiKey
    - database_role
    - database_password
*/

module.exports = () => function setDbConfigurationFromContextMiddleware(req, res, next) {
  const context = res.locals;
  setDbConfigFromUserMetadata(context);
  setDbCredentials(context);
  next();
};

//-----------------------------------------------------------------------------

const createError = require('http-errors');
const debug = require('debug')('db:user');

function setDbConfigFromUserMetadata(context) {
  context.db.host = context.userContext.metadata.database_host;
  context.db.name = context.userContext.metadata.database_name;  
  
  context.db.masterUser = context.userContext.metadata.database_master_role;
  context.db.masterPassword = context.userContext.metadata.database_master_password;  

  context.db.port = context.userContext.metadata.database_port || 5432; //TODO config

  debug(`Set DB configuration from User's metadata. ${context.db.host}, DB name: ${context.db.name}`);
}

function setDbCredentials(context) {
  if (context.auth.isApiKeyAuth()) {
    setDbCredentialsFromApiKey(context)
  } else if (context.auth.isNamedMapAuth()) {
    setDbCredentialsFromMaster(context);
  } else {
    return createError(401, 'auhtorization-required', { type: 'auth', subtype: 'auhtorization-required' });
  }
}

function setDbCredentialsFromApiKey(context) {
  context.db.user = context.auth.apiKey.database_role;
  context.db.password = context.auth.apiKey.database_password;  

  debug(`Set DB credentials from API key. DB role: ${context.db.user}, DB password: ${context.db.password}`);
}

function setDbCredentialsFromMaster(context) {
  context.db.user = context.userContext.metadata.database_master_rol;
  context.db.password = context.userContext.metadata.database_master_password;  

  debug(`Set DB credentials from Master. DB role: ${context.db.user}, DB password: ${context.db.password}`);
}
