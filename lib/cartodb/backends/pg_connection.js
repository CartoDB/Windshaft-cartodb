'use strict';

const PSQL = require('cartodb-psql');

function PgConnection(metadataBackend) {
    this.metadataBackend = metadataBackend;
}

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
    require('debug')('cachechan')("getConn1");

    return callback(null, new PSQL({
        user: dbConfig.user,
        pass: dbConfig.password,
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.name
    }));
};
