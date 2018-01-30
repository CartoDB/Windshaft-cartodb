'use strict';

const PSQL = require('cartodb-psql');
const debug = require('debug')('db:pgConnection');

function PgConnection() {}

module.exports = PgConnection;

/**
 * Returns a `cartodb-psql` object.
 * @param {Object} dbConfig Database connection configuration:
 * - host: database host
 * - port: database port
 * - name: database name
 * - user: database username
 * - password: database user password
 * @param {Function} callback function({Error}, {PSQL})
 */
PgConnection.prototype.getConnection = function(dbConfig) {
    debug('get Connection');

    return new PSQL(this.getConnectionParams(dbConfig));
};

/**
 * Returns an object with the params needed to connect to the DB.
 * @param {Object} dbConfig Database connection configuration:
 * - host: database host
 * - port: database port
 * - name: database name
 * - user: database username
 * - password: database user password
 */
PgConnection.prototype.getConnectionParams = function(dbConfig) {
    return {
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.name,
        user: dbConfig.user,
        password: dbConfig.password,
    };
};

/**
 * Returns a `cartodb-psql` object.
 * @param {Object} dbConfig Database connection configuration:
 * - host: database host
 * - port: database port
 * - name: database name
 * - masterUser: database master username
 * - masterPassword: database user master password
 * @param {Function} callback function({Error}, {PSQL})
 */
PgConnection.prototype.getMasterConnection = function(dbConfig) {
    debug('configure Master Connection');

    return new PSQL(this.getMasterConnectionParams(dbConfig));
};

/**
 * Returns an object with the params needed to connect to the DB as master.
 * @param {Object} dbConfig Database connection configuration:
 * - host: database host
 * - port: database port
 * - name: database name
 * - masterUser: database master username
 * - masterPassword: database user master password
 */
PgConnection.prototype.getMasterConnectionParams = function(dbConfig) {
    return {
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.name,
        user: dbConfig.masterUser,
        password: dbConfig.masterPassword,
    };
};

PgConnection.prototype.getConnectionFromParams = function(params) {
    debug('get Connection');

    return new PSQL(this.getConnectionParamsFromParams(params));
};

PgConnection.prototype.getConnectionParamsFromParams = function(params) {
    return {
        host: params.dbhost,
        port: params.dbport,
        dbname: params.dbname,
        user: params.dbuser,
        password: params.dbpassword
    };
};
