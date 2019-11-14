'use strict';

module.exports = function authorize (authBackend) {
    return function authorizeMiddleware (req, res, next) {
        authBackend.authorize(req, res, (err, authorized) => {
            req.profiler.done('authorize');

            if (err) {
                return next(err);
            }

            if (!authorized) {
                err = new Error('Sorry, you are unauthorized (permission denied)');
                err.http_status = 403;
                return next(err);
            }

            return next();
        });
    };
};
