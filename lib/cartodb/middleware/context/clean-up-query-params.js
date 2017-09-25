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

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
        // parse url params to an object and it's performed after matching path and controller.
        req.locals = {};
        _.extend(req.locals, req.params);

        next();
    };
};
