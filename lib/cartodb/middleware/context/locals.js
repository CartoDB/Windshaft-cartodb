const _ = require('underscore');

module.exports = function localsMiddleware(req, res, next) {
    _.extend(res.locals, req.params);
    
    next();
};

