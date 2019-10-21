'use strict';

const _ = require('underscore');

module.exports = function dbConnSetup (pgConnection) {
    return function dbConnSetupMiddleware (req, res, next) {
        const { user } = res.locals;

        pgConnection.setDBConn(user, res.locals, (err) => {
            req.profiler.done('dbConnSetup');

            if (err) {
                if (err.message && err.message.indexOf('name not found') !== -1) {
                    err.http_status = 404;
                }

                return next(err);
            }

            _.defaults(res.locals, {
                dbuser: global.environment.postgres.user,
                dbpassword: global.environment.postgres.password,
                dbhost: global.environment.postgres.host,
                dbport: global.environment.postgres.port
            });

            res.set('X-Served-By-DB-Host', res.locals.dbhost);

            next();
        });
    };
};
