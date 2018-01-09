'use strict';

function initUserContext(context) {
  context.userContext = {}; // TODO user field is already taken. Refactor later
}

module.exports = () => (req, res, next) => {
    initUserContext(res.locals);
    next();
};
