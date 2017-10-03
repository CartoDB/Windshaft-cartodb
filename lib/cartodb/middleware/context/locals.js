const _ = require('underscore');

module.exports = function localsMiddleware(req, res, next) {
    res.locals = {};
    _.extend(res.locals, req.params);

    next();
};

