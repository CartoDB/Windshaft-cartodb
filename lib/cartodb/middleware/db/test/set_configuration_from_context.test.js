'use strict';

const assert = require('../../../../../test/support/assert');

const GENERIC_DB_ROLE = 'role_example';
const GENERIC_DB_PASSWORD = 'password_example';
const GENERIC_DB_NAME = 'name_example';
const GENERIC_DB_HOST = 'host_example';

const DB_ROLE_FIELD_NAME = 'database_role';  //TODO config
const DB_PASSWORD_FIELD_NAME = 'database_password';  //TODO config

const contextUpdater = require('../set_configuration_from_context')();

describe('Update context', () => {
  it('From API key', next => {
   const res = {
      locals: {  
        auth: {
          apiKey: {
            [DB_ROLE_FIELD_NAME]: GENERIC_DB_ROLE,
            [DB_PASSWORD_FIELD_NAME]: GENERIC_DB_PASSWORD,
          }
        },
        db: {},
        userContext: {
          metadata: {
            database_host: GENERIC_DB_HOST,
            database_name: GENERIC_DB_NAME,
          }
        }
      }
    };

    const context = res.locals;

    contextUpdater({}, res, () => {
      assert.equal(context.db.user, GENERIC_DB_ROLE);
      assert.equal(context.db.password, GENERIC_DB_PASSWORD);
      next();
    });
  });
});