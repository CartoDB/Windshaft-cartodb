'use strict';

function initDbContext(context) {
  context.db = {};
}

module.exports = () => (req, res, next) => {
    initDbContext(res.locals);
    next();
};
