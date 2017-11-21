'use strict';

const debug = require('debug')('db:user');

function setDbConfigFromUserMetadata(context) {
  context.db.host = context.userContext.metadata.database_host;
  context.db.name = context.userContext.metadata.database_name;  
  
  context.db.masterUser = context.userContext.metadata.database_master_role;
  context.db.masterPassword = context.userContext.metadata.database_master_password;  

  context.db.port = 5432; //TODO config

  debug(`Set DB configuration from User's metadata. DB host: ${context.db.host}, DB name: ${context.db.dbName}`);
}

function setDbCredentialsFromApiKey(context) {
  context.db.user = context.auth.apiKey.database_role;
  context.db.password = context.auth.apiKey.database_password;  

  debug(`Set DB credentials from API key. DB role: ${context.db.user}, DB password: ${context.db.password}`);
}

module.exports = () => (req, res, next) => {
    const context = res.locals;
    setDbConfigFromUserMetadata(context);
    setDbCredentialsFromApiKey(context);
    next();
};
