const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');
const apikeyCredentials = require('./apikey-credentials');
const authorize = require('./authorize');
const dbConnSetup = require('./db-conn-setup');

module.exports = function prepareContextMiddleware(authApi, pgConnection) {
    return [
        locals,
        cleanUpQueryParams(),
        layergroupToken,
        apikeyCredentials(),
        authorize(authApi),
        dbConnSetup(pgConnection)
    ];
};
