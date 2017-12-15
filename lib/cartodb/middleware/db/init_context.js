'use strict';

function initDbContext(context) {
  context.db = {};
}

module.exports = () => function initDbContextMiddleware(req, res, next) {
    initDbContext(res.locals);
    next();
};
