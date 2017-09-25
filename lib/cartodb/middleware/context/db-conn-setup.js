const _ = require('underscore');

module.exports = function dbConnSetupMiddleware(pgConnection) {
    return function (req, res, next) {
        const user = req.context.user;

        // FIXME: this function shouldn't be able to change `req.params`. It should return an
        // object with the user's conf and it should be merge with default here.
        pgConnection.setDBConn(user, req.params, (err) => {
            if (err) {
                if (err.message && -1 !== err.message.indexOf('name not found')) {
                    err.http_status = 404;
                }
                req.profiler.done('req2params');
                return next(err, req);
            }

            // Add default database connection parameters
            // if none given
            _.defaults(req.params, {
                dbuser: global.environment.postgres.user,
                dbpassword: global.environment.postgres.password,
                dbhost: global.environment.postgres.host,
                dbport: global.environment.postgres.port
            });

            // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
            // parse url params to an object and it's performed after matching path and controller.
            _.defaults(req.locals, req.params);

            req.profiler.done('req2params');

            next(null, req);
        });
    };
};