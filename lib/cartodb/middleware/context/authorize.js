const _ = require('underscore');

module.exports = function authorizeMiddleware (authApi) {
    return function (req, res, next) {
        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
        // parse url params to an object and it's performed after matching path and controller.
        req.locals = {};
        _.extend(req.locals, req.params);

        req.profiler.done('req2params.setup');

        authApi.authorize(req, (err, authorized) => {
            req.profiler.done('authorize');
            if (err) {
                return next(err);
            }

            if(!authorized) {
                err = new Error("Sorry, you are unauthorized (permission denied)");
                err.http_status = 403;
                return next(err);
            }

            return next();
        });
    };
};
