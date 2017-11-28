'use strict';

const PSQL = require('cartodb-psql');
const debug = require('debug')('db:pgConnection');

function PgConnection() {}

module.exports = PgConnection;

// Deprecated - use infor from res.locals
PgConnection.prototype.setDBAuth = function(username, params, callback) {
    callback();
};

// Deprecated - use infor from res.locals
PgConnection.prototype.setDBConn = function(dbowner, params, callback) {
    callback();
};

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
PgConnection.prototype.getConnection = function(dbConfig, callback) {
    debug('get Connection');

    return callback(null, new PSQL({
        user: dbConfig.user,
        pass: dbConfig.password,
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.name
    }));
};
