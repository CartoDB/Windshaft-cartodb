const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');
const apikeyToken = require('./apikey-token');
const authorize = require('./authorize');
const dbConnSetup = require('./db-conn-setup');

module.exports = function prepareContextMiddleware(authApi, pgConnection) {
    return [
        locals,
        cleanUpQueryParams(),
        layergroupToken,
        apikeyToken(),
        authorize(authApi),
        dbConnSetup(pgConnection)
    ];
};
