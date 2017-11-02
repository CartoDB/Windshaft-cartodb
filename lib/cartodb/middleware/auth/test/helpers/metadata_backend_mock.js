'use strict';

const GRANTS_API_PREFIX = 'grants_'; //TODO config

const MASTER_TYPE = 'master';  //TODO config
const DEFAULT_TYPE = 'default';  //TODO config
const REGULAR_TYPE = 'regular';  //TODO config


const THIS_API = 'sql';
module.exports.THIS_API = THIS_API;

const OTHER_API = 'maps';
module.exports.OTHER_API = OTHER_API;

const GENERIC_DB_ROLE = 'cdb_role_ZZZZ';
module.exports.GENERIC_DB_ROLE = GENERIC_DB_ROLE;

const GENERIC_DB_PASSWORD = 'zZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZ';
module.exports.GENERIC_DB_PASSWORD = GENERIC_DB_PASSWORD;

const EXAMPLE_APIKEY_USERNAME = 'username';
module.exports.EXAMPLE_APIKEY_USERNAME = EXAMPLE_APIKEY_USERNAME;

const EXAMPLE_APIKEY_TOKEN = 'exampleAPIkeyToken';
module.exports.EXAMPLE_APIKEY_TOKEN = EXAMPLE_APIKEY_TOKEN;

const MASTER_APIKEY_TOKEN = 'masterAPIkeyToken';
module.exports.MASTER_APIKEY_TOKEN = MASTER_APIKEY_TOKEN;

const NO_ACCESS_APIKEY_TOKEN = 'noAccessAPIkeyToken';
module.exports.NO_ACCESS_APIKEY_TOKEN = NO_ACCESS_APIKEY_TOKEN;

const DEFAULT_APIKEY_TOKEN = 'default_public';
module.exports.DEFAULT_APIKEY_TOKEN = DEFAULT_APIKEY_TOKEN;


module.exports.metadataBackendApiKeysMock = {
  getApiKey: ({username, apiKeyToken}, callback) => {
    let apiKey = null;
    switch (apiKeyToken) {
      case EXAMPLE_APIKEY_TOKEN:
        apiKey = {
          type: REGULAR_TYPE,
          [`${GRANTS_API_PREFIX}${THIS_API}`]: true,
          [`${GRANTS_API_PREFIX}${OTHER_API}`]: true,
          dbRole: GENERIC_DB_ROLE,
          dbPassword: GENERIC_DB_PASSWORD,
        };
        break;
      case NO_ACCESS_APIKEY_TOKEN:
        apiKey = {
          type: REGULAR_TYPE,
          [`${GRANTS_API_PREFIX}${OTHER_API}`]: true,
          dbRole: GENERIC_DB_ROLE,
          dbPassword: GENERIC_DB_PASSWORD,
        };
        break;
      case DEFAULT_APIKEY_TOKEN:
        apiKey = {
          type: DEFAULT_TYPE,
          [`${GRANTS_API_PREFIX}${THIS_API}`]: true,
          [`${GRANTS_API_PREFIX}${OTHER_API}`]: true,
          dbRole: GENERIC_DB_ROLE,
          dbPassword: GENERIC_DB_PASSWORD,
        };
        break;
      case MASTER_APIKEY_TOKEN:
        apiKey = {
          type: MASTER_TYPE,
          dbRole: GENERIC_DB_ROLE,
          dbPassword: GENERIC_DB_PASSWORD,
        };
        break;
    }

    return process.nextTick(() => callback(null, apiKey));
  }
};
