'use strict';

const initContextMiddleware = require('../init_context')();
const expect = require('chai').expect

describe('Init context', () => { 
  it('res.locals.auth exists', () => {
    const res = {
      locals: {}
    };

    initContextMiddleware({}, res, () => {
      expect(res.locals.auth).to.exist;
    })
  });
});
