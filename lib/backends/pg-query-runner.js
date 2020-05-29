'use strict';

const PSQL = require('cartodb-psql');
const dbParamsFromReqParams = require('../utils/database-params');

module.exports = class PgQueryRunner {
    constructor (pgConnection) {
        this._pgConnection = pgConnection;
    }

    run (username, query, callback) {
        this._pgConnection.getDatabaseParams(username, (err, databaseParams) => {
            if (err) {
                return callback(err);
            }

            const psql = new PSQL(dbParamsFromReqParams(databaseParams));

            psql.query(query, (err, resultSet = {}) => {
                if (err) {
                    return callback(err);
                }

                const { rows = [] } = resultSet;

                return callback(null, rows);
            });
        });
    }
};
