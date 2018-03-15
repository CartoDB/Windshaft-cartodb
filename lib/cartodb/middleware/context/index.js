const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');
const layergroupToken = require('./layergroup-token');
const credentials = require('./credentials');

module.exports = function prepareContextMiddleware() {
    return [
        locals(),
        cleanUpQueryParams(),
        layergroupToken(),
        credentials(),
    ];
};
