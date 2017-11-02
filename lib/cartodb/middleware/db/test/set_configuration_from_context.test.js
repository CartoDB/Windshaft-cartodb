'use strict';

const expect = require('chai').expect;

const GENERIC_DB_ROLE = 'role_example';
const GENERIC_DB_PASSWORD = 'password_example';
const GENERIC_DB_NAME = 'name_example';
const GENERIC_DB_HOST = 'host_example';

const DB_ROLE_FIELD_NAME = 'dbRole';  //TODO config
const DB_PASSWORD_FIELD_NAME = 'dbPassword';  //TODO config

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
      expect(context.db.user).to.equal(GENERIC_DB_ROLE);
      expect(context.db.password).to.equal(GENERIC_DB_PASSWORD);
      next();
    });
  });
});
