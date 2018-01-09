'use strict';

/*
  creates the res.locals.auth empty object.
*/


function initAuthContext(context) {
  context.auth = {};
}

module.exports = () => {
  return function initAuthContextMiddleware(req, res, next) {
    initAuthContext(res.locals);
    next();
  };
};
