const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');
const credentials = require('./credentials');
const authorize = require('./authorize');

module.exports = function prepareContextMiddleware(authApi) {
    return [
        locals(),
        cleanUpQueryParams(),
        layergroupToken(),
        credentials(),
        authorize(authApi)
    ];
};
