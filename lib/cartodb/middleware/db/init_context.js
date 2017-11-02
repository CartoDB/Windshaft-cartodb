'use strict';

function initDbContext(context) {
  context.db = {};
}

module.exports = () => {
  return (req, res, next) => {
    initDbContext(res.locals);
    next();
  };
};
