const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');
const credentials = require('./credentials');
const authorize = require('./authorize');
const dbConnSetup = require('./db-conn-setup');

module.exports = function prepareContextMiddleware(authApi, pgConnection) {
    return [
        locals,
        cleanUpQueryParams(),
        layergroupToken,
        credentials(),
        authorize(authApi),
        dbConnSetup(pgConnection)
    ];
};
