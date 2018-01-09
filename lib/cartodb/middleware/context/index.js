'use strict';

const locals = require('./locals');
const cleanUpQueryParams = require('./clean-up-query-params');

module.exports = function prepareContextMiddleware() {
    return [
        locals,
        cleanUpQueryParams(),
    ];
};
