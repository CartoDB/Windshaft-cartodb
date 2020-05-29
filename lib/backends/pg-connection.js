'use strict';

const PSQL = require('cartodb-psql');
const _ = require('underscore');
const dbParamsFromReqParams = require('../utils/database-params');

module.exports = class PgConnection {
    constructor (metadataBackend) {
        this._metadataBackend = metadataBackend;
    }

    setDBAuth (username, params, apikeyType, callback) {
        if (apikeyType === 'master') {
            this._metadataBackend.getMasterApikey(username, (err, apikey) => {
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
            this._metadataBackend.getApikey(username, params.api_key, (err, apikey) => {
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
            this._metadataBackend.getApikey(username, 'default_public', (err, apikey) => {
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
    }

    // FIXME: this should not override params argument
    setDBConn (dbowner, params, callback) {
        _.defaults(params, {
            dbhost: global.environment.postgres.host,
            dbport: global.environment.postgres.port
        });

        this._metadataBackend.getUserDBConnectionParams(dbowner, (err, dbParams) => {
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
    }

    getConnection (username, callback) {
        this.getDatabaseParams(username, (err, databaseParams) => {
            if (err) {
                return callback(err);
            }

            return callback(err, new PSQL(dbParamsFromReqParams(databaseParams)));
        });
    }

    getDatabaseParams (username, callback) {
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
    }
};

function isNameNotFoundError (err) {
    return err.message && err.message.indexOf('name not found') !== -1;
}
