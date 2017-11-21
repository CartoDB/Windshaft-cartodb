const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');

module.exports = function prepareContextMiddleware() {
    return [
        locals,
        cleanUpQueryParams(),
        layergroupToken
    ];
};
