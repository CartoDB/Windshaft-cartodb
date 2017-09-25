const cleanUpQueryParams = require('./clean-up-query-params');
const parseTokenParam = require('./parse-token-param');
const authorize = require('./authorize');
const dbConnSetup = require('./db-conn-setup');

module.exports = function prepareContextMiddleware(authApi, pgConnection) {
    return [
        cleanUpQueryParams(),
        parseTokenParam(),
        authorize(authApi),
        dbConnSetup(pgConnection)
    ];
};
