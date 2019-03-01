'use strict';

const _ = require('underscore');

// Whitelist query parameters and attach format
const REQUEST_QUERY_PARAMS_WHITELIST = [
    'config',
    'map_key',
    'api_key',
    'auth_token',
    'callback',
    'zoom',
    'lon',
    'lat',
    // analysis
    'filters' // json
];

module.exports = function cleanUpQueryParamsMiddleware (customQueryParams = []) {
    if (!Array.isArray(customQueryParams)) {
        throw new Error('customQueryParams must receive an Array of params');
    }

    return function cleanUpQueryParams (req, res, next) {
        const allowedQueryParams = [...REQUEST_QUERY_PARAMS_WHITELIST, ...customQueryParams];

        req.query = _.pick(req.query, allowedQueryParams);

        next();
    };
};
