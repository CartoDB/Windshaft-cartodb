
'use strict';

const authorizeMiddleware = require('../authorize');
const assert = require('../../../../../test/support/assert');

const GRANTS_API_PREFIX = 'grants_'; //TODO config

const {
  THIS_API,
  OTHER_API,
  EXAMPLE_APIKEY_USERNAME,
  EXAMPLE_APIKEY_TOKEN,
  MASTER_APIKEY_TOKEN,
  NO_ACCESS_APIKEY_TOKEN,
  metadataBackendApiKeysMock,
} = require('./helpers/metadata_backend_mock');

function createContext({auth = null, user = null} = {}) {
  const res = {
        locals: {
          user: EXAMPLE_APIKEY_USERNAME,
          auth: {},
        },
      };

  const context = res.locals;

  if (auth) {
    context.auth = auth;
  }

  if (user) {
    context.user = user;
  }

  return res;
}

const authorize = authorizeMiddleware({apiName: THIS_API, metadataBackend:metadataBackendApiKeysMock});

describe('Authorize', () => {

  describe('Authorization granted', () => {
    
    it('Regular key with access granted', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: EXAMPLE_APIKEY_TOKEN,
          username: EXAMPLE_APIKEY_USERNAME,
        }
      });

      authorize({}, res, (err) => {
        assert.ifError(err);
        next();
      });
    });

    it('Is master key', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: MASTER_APIKEY_TOKEN,
          username: EXAMPLE_APIKEY_USERNAME,
        }
      });

      authorize({}, res, (err) => {
        assert.ifError(err);
        next();
      });
    });

    it('Save API key to context', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: EXAMPLE_APIKEY_TOKEN,
          username: EXAMPLE_APIKEY_USERNAME,
        }
      });

      authorize({}, res, (err) => {
        assert(res.locals.auth.apiKey);
        next();
      });
    });
  });

  describe('Authorization denied', () => {
    
    it('API key username VS user mismatch', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: EXAMPLE_APIKEY_TOKEN,
          username: EXAMPLE_APIKEY_USERNAME,
        },
        user: 'asdf',
      });

      authorize({}, res, (err) => {
        assert.equal(err.status, 401);
        assert.equal(err.message, 'api-key-username-mismatch')
        next();
      });
    });

    it('No apikey', (next) => {
      const res = createContext();      

      authorize({}, res, (err) => {
        assert.equal(err.status, 401);
        assert.equal(err.message, 'api-key-required')
        next();
      })
    });

    it('API key does not grant access to API', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: NO_ACCESS_APIKEY_TOKEN,
        }
      });

      authorize({}, res, (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.message, 'api-key-doesnt-grant-access-to-this-api')
        next();
      })
    });

    it('API key not found', (next) => {
      const res = createContext({
        auth: {
          apiKeyToken: 'asdf',
        }
      });

      authorize({}, res, (err) => {
        assert.equal(err.status, 401);
        assert.equal(err.message, 'api-key-not-found')
        next();
      });
    });
    
  });

});
