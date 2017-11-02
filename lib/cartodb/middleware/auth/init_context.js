'use strict';

function initAuthContext(context) {
  context.auth = {};
}

module.exports = () => {
  return (req, res, next) => {
    initAuthContext(res.locals);
    next();
  };
};
