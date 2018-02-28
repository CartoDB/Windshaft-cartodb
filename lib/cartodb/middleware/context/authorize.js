module.exports = function authorize (authApi) {
    return function authorizeMiddleware (req, res, next) {
        authApi.authorize(req, res, (err, authorized) => {
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
