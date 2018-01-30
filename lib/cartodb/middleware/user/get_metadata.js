'use strict';

const _ = require('underscore');
const authUser = global.environment.postgres_auth_user;
const authPass = global.environment.postgres_auth_pass;

module.exports = ({ metadataBackend }) => (req, res, next) => {
    const userContext = res.locals.userContext;

    metadataBackend.getAllUserDBParams(res.locals.user, (err, params) => {
        if (err) {
            return next(err);
        }

        // remove null properties
        Object.keys(params).forEach(k => (!params[k] && params[k] !== undefined) && delete params[k]);

        const userDatabaseParams = Object.assign({}, params);

        _.defaults(userDatabaseParams, {
            dbpublicuser: global.environment.postgres.user,
            dbpublicpass: global.environment.postgres.password,
            dbhost: global.environment.postgres.host,
            dbport: global.environment.postgres.port
        });

        userDatabaseParams.dbuser = _.template(authUser, { user_id: params.dbuser });

        if (authPass && (authPass.match(/\buser_password\b/) || authPass.match(/\buser_id\b/))) {
            userDatabaseParams.dbpass = _.template(authPass, {
                user_id: params.dbuser,
                user_password: params.dbpass
            });
        }

        userContext.metadata = userDatabaseParams;

        next();
    });
};
