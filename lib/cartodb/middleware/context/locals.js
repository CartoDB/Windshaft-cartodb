const _ = require('underscore');

module.exports = function layergroupTokenMiddleware(req, res, next) {
    // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
    // parse url params to an object and it's performed after matching path and controller.
    res.locals = {};
    _.extend(res.locals, req.params);

    next();
}

