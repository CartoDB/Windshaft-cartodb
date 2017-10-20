const _ = require('underscore');

module.exports = function localsMiddleware(req, res, next) {
    _.defaults(res.locals, req.params);
    
    next();
};

