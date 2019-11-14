'use strict';

var PSQL = require('cartodb-psql');
var _ = require('underscore');
const debug = require('debug')('cachechan');
const dbParamsFromReqParams = require('../utils/database-params');

function PgConnection (metadataBackend) {
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
PgConnection.prototype.setDBAuth = function (username, params, apikeyType, callback) {
    if (apikeyType === 'master') {
        this.metadataBackend.getMasterApikey(username, (err, apikey) => {
            if (err) {
                if (isNameNotFoundError(err)) {
                    err.http_status = 404;
                }
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            return callback();
        });
    } else if (apikeyType === 'regular') { // Actually it can be any type of api key
        this.metadataBackend.getApikey(username, params.api_key, (err, apikey) => {
            if (err) {
                if (isNameNotFoundError(err)) {
                    err.http_status = 404;
                }
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            return callback();
        });
    } else if (apikeyType === 'default') {
        this.metadataBackend.getApikey(username, 'default_public', (err, apikey) => {
            if (err) {
                if (isNameNotFoundError(err)) {
                    err.http_status = 404;
                }
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            return callback();
        });
    } else {
        return callback(new Error(`Invalid Apikey type: ${apikeyType}, valid ones: master, regular, default`));
    }
};

function isNameNotFoundError (err) {
    return err.message && err.message.indexOf('name not found') !== -1;
}

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
PgConnection.prototype.setDBConn = function (dbowner, params, callback) {
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

PgConnection.prototype.getConnection = function (username, callback) {
    debug('getConn1');

    this.getDatabaseParams(username, (err, databaseParams) => {
        if (err) {
            return callback(err);
        }
        return callback(err, new PSQL(dbParamsFromReqParams(databaseParams)));
    });
};

PgConnection.prototype.getDatabaseParams = function (username, callback) {
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
