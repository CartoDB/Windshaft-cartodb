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

module.exports = function cleanUpQueryParamsMiddleware () {
    return function cleanUpQueryParams (req, res, next) {
        var allowedQueryParams = REQUEST_QUERY_PARAMS_WHITELIST;

        if (Array.isArray(req.context.allowedQueryParams)) {
            allowedQueryParams = allowedQueryParams.concat(req.context.allowedQueryParams);
        }

        req.query = _.pick(req.query, allowedQueryParams);

        // bring all query values onto res.locals object
        _.extend(res.locals, req.query);

        next();
    };
};
