const _ = require('underscore');

module.exports = function dbConnSetupMiddleware(pgConnection) {
    return function dbConnSetup(req, res, next) {
        const user = res.locals.user;
        pgConnection.setDBConn(user, res.locals, (err) => {
            if (err) {
                if (err.message && -1 !== err.message.indexOf('name not found')) {
                    err.http_status = 404;
                }
                req.profiler.done('req2params');
                return next(err);
            }

            // Add default database connection parameters
            // if none given
            _.defaults(res.locals, {
                dbuser: global.environment.postgres.user,
                dbpassword: global.environment.postgres.password,
                dbhost: global.environment.postgres.host,
                dbport: global.environment.postgres.port
            });
            
            res.set('X-Served-By-DB-Host', res.locals.dbhost);

            req.profiler.done('req2params');
            
            next(null);
        });
    };
};
