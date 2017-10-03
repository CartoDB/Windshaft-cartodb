module.exports = function authorizeMiddleware (authApi) {
    return function (req, res, next) {
        req.profiler.done('req2params.setup');

        authApi.authorize(req, res.locals, (err, authorized) => {
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
