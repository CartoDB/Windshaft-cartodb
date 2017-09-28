const _ = require('underscore');

module.exports = function dbConnSetupMiddleware(pgConnection) {
    return function (req, res, next) {
        const user = req.context.user;

        res.locals.db = {}
        pgConnection.setDBConn(user, res.locals.db, (err) => {
            if (err) {
                if (err.message && -1 !== err.message.indexOf('name not found')) {
                    err.http_status = 404;
                }
                req.profiler.done('req2params');
                return next(err, req);
            }

            // Add default database connection parameters
            // if none given
            _.defaults(res.locals.db, {
                dbuser: global.environment.postgres.user,
                dbpassword: global.environment.postgres.password,
                dbhost: global.environment.postgres.host,
                dbport: global.environment.postgres.port
            });

            
            req.profiler.done('req2params');

            next(null, req);
        });
    };
};
