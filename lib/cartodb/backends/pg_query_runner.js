var PSQL = require('cartodb-psql');

function PgQueryRunner(pgConnection) {
    this.pgConnection = pgConnection;
}

module.exports = PgQueryRunner;

/**
 * Runs `query` with `username`'s PostgreSQL role, callback receives error and rows array.
 *
 * @param {String} username
 * @param {String} query
 * @param {Function} callback function({Error}, {Array}) second argument is guaranteed to be an array
 */
PgQueryRunner.prototype.run = function(username, query, callback) {

    this.pgConnection.getDatabaseParams(username, (err, databaseParams) => {
        if (err) {
            return callback(err);
        }

        const psql = new PSQL({
            user: databaseParams.dbuser,
            pass: databaseParams.dbpass,
            host: databaseParams.dbhost,
            port: databaseParams.dbport,
            dbname: databaseParams.dbname
        });

        psql.query(query, function (err, resultSet) {
            resultSet = resultSet || {};
            return callback(err, resultSet.rows || []);
        });
    });
};
