'use strict';

const initContextMiddleware = require('../init_context')();
const assert = require('../../../../../test/support/assert');

describe('Init context', () => { 
  it('res.locals.db exists', () => {
    const res = {
      locals: {}
    };

    initContextMiddleware({}, res, () => {
      assert(res.locals.db);
    });
  });
});
