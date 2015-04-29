var PSQL = require('cartodb-psql');
var step = require('step');

function PgQueryRunner(pgConnection) {
    this.pgConnection = pgConnection;
}

module.exports = PgQueryRunner;


PgQueryRunner.prototype.run = function(username, query, queryHandler, callback) {
    var self = this;

    var params = {};

    step(
        function setAuth() {
            self.pgConnection.setDBAuth(username, params, this);
        },
        function setConn(err) {
            if (err) {
                throw err;
            }
            self.pgConnection.setDBConn(username, params, this);
        },
        function executeQuery(err) {
            if (err) {
                throw err;
            }
            var psql = new PSQL({
                user: params.dbuser,
                pass: params.dbpass,
                host: params.dbhost,
                port: params.dbport,
                dbname: params.dbname
            });
            psql.query(query, function(err, resultSet) {
                resultSet = resultSet || {};
                var rows = resultSet.rows || [];
                queryHandler(err, rows, callback);
            });
        }
    );
};
