'use strict';

const PSQL = require('cartodb-psql');

function PgQueryRunner(pgConnection) {
    this.pgConnection = pgConnection;
}

module.exports = PgQueryRunner;

/**
 * Runs `query` with `dbConfig` PostgreSQL configuration, callback receives error and rows array.
 *
 * @param {Object} dbConfig Database connection configuration:
 * - host: database host
 * - port: database port
 * - name: database name
 * - user: database username
 * - password: database user password
 * @param {String} query
 * @param {Function} callback function({Error}, {Array}) second argument is guaranteed to be an array
 */
PgQueryRunner.prototype.run = function(dbConfig, query, callback) {
    const psql = new PSQL({
        user: dbConfig.user,
        pass: dbConfig.password,
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.name
    });

    psql.query(query, (err, resultSet={rows: []}) => callback(err, resultSet.rows));
};
