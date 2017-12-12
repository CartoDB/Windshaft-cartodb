'use strict';

function PgQueryRunner() {}

module.exports = PgQueryRunner;

/**
 * Runs `query` using `dbConnection` `cartodb-psql` objec, callback receives error and rows array.
 *
 * @param {Object} dbConnection `cartodb-psql` object
 * @param {String} query
 * @param {Function} callback function({Error}, {Array}) second argument is guaranteed to be an array
 */
PgQueryRunner.prototype.run = (dbConnnection, query, callback) => {
    dbConnnection.query(query, (err, resultSet = { rows: [] }) => callback(err, resultSet.rows));
};
