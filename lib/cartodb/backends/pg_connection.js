var PSQL = require('cartodb-psql');
var _ = require('underscore');

function PgConnection(metadataBackend) {
    this.metadataBackend = metadataBackend;
}

module.exports = PgConnection;


// Set db authentication parameters to those of the given username
//
// @param username the cartodb username, mapped to a database username
//                 via CartodbRedis metadata records
//
// @param params the parameters to set auth options into
//               added params are: "dbuser" and "dbpassword"
//
// @param callback function(err)
//
PgConnection.prototype.setDBAuth = function(username, params, apikeyType, callback) {
    if (apikeyType === 'master') {
        this.metadataBackend.getMasterApikey(username, (err, apikey) => {
            if (err) {
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            //Remove this block when Auth fallback is not used anymore
            // AUTH_FALLBACK
            if (!params.dbuser && apikey.user_id && global.environment.postgres_auth_user) {
                params.dbuser = _.template(global.environment.postgres_auth_user, apikey);
            }

            return callback();
        });
    } else if (apikeyType === 'regular') { //Actually it can be any type of api key
        this.metadataBackend.getApikey(username, params.api_key || params.map_key, (err, apikey) => {
            if (err) {
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            //Remove this block when Auth fallback is not used anymore
            // AUTH_FALLBACK
            if (!params.dbuser && apikey.user_id && apikey.type === 'master' && global.environment.postgres_auth_user) {
                params.dbuser = _.template(global.environment.postgres_auth_user, apikey);
            }

            //Remove this block when Auth fallback is not used anymore
            // AUTH_FALLBACK
            if (!params.dbpassword && global.environment.postgres.password) {
                params.dbpassword = global.environment.postgres.password;
            }

            //Remove this block when Auth fallback is not used anymore
            // AUTH_FALLBACK
            // If api key not found use default
            if (!params.dbuser && !params.dbpassword) {
                return this.setDBAuth(username, params, 'default', callback);
            }

            return callback();           
        });
    } else if (apikeyType === 'default') {
        this.metadataBackend.getApikey(username, 'default_public', (err, apikey) => {
            if (err) {
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            //Remove this block when Auth fallback is not used anymore
            // AUTH_FALLBACK
            if (!params.dbpassword && global.environment.postgres.password) {
                params.dbpassword = global.environment.postgres.password;
            }

            return callback();
        });
    } else {
        return callback(new Error(`Invalid Apikey type: ${apikeyType}, valid ones: master, regular, default`));
    }
};

// Set db connection parameters to those for the given username
//
// @param dbowner cartodb username of database owner,
//                mapped to a database username
//                via CartodbRedis metadata records
//
// @param params the parameters to set connection options into
//               added params are: "dbname", "dbhost"
//
// @param callback function(err)
//
PgConnection.prototype.setDBConn = function(dbowner, params, callback) {
    _.defaults(params, {
        // dbuser: global.environment.postgres.user,
        // dbpassword: global.environment.postgres.password,
        dbhost: global.environment.postgres.host,
        dbport: global.environment.postgres.port
    });

    this.metadataBackend.getUserDBConnectionParams(dbowner, (err, dbParams) => {
        if (err) {
            return callback(err);
        }

        // we don’t want null values or overwrite a non public user
        if (params.dbuser !== 'publicuser' || !dbParams.dbuser) {
            delete dbParams.dbuser;
        }

        if (dbParams) {
            _.extend(params, dbParams);
        }

        callback();
    });
};

/**
 * Returns a `cartodb-psql` object for a given username.
 * @param {String} username
 * @param {Function} callback function({Error}, {PSQL})
 */

PgConnection.prototype.getConnection = function(username, callback) {
    require('debug')('cachechan')("getConn1");

    this.getDatabaseParams(username, (err, databaseParams) => {
        if (err) {
            return callback(err);
        }
        return callback(err, new PSQL({
            user: databaseParams.dbuser,
            pass: databaseParams.dbpass,
            host: databaseParams.dbhost,
            port: databaseParams.dbport,
            dbname: databaseParams.dbname
        }));

    });
};

PgConnection.prototype.getDatabaseParams = function(username, callback) {
    const databaseParams = {};

    this.setDBAuth(username, databaseParams, 'master', err => {
        if (err) {
            return callback(err);
        }

        this.setDBConn(username, databaseParams, err => {
            if (err) {
                return callback(err);
            }

            callback(null, databaseParams);
        });
    });
};
