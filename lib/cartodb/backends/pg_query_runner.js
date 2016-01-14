var assert = require('assert');
var PSQL = require('cartodb-psql');
var step = require('step');

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
    var self = this;

    var params = {};

    step(
        function setAuth() {
            self.pgConnection.setDBAuth(username, params, this);
        },
        function setConn(err) {
            assert.ifError(err);
            self.pgConnection.setDBConn(username, params, this);
        },
        function executeQuery(err) {
            assert.ifError(err);
            var psql = new PSQL({
                user: params.dbuser,
                pass: params.dbpass,
                host: params.dbhost,
                port: params.dbport,
                dbname: params.dbname
            });
            psql.query(query, function(err, resultSet) {
                resultSet = resultSet || {};
                return callback(err, resultSet.rows || []);
            });
        }
    );
};
