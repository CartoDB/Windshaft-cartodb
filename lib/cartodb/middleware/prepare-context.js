var assert = require('assert');
var _ = require('underscore');
var step = require('step');

// Whitelist query parameters and attach format
var REQUEST_QUERY_PARAMS_WHITELIST = [
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

// jshint maxcomplexity:8
/**
 * Whitelist input and get database name & default geometry type from
 * subdomain/user metadata held in CartoDB Redis
 * @param req - standard express request obj. Should have host & table
 * @param callback
 */
module.exports = function prepareContextMiddleware (authApi, pgConnection) {
    return [
        function cleanUpQueryParams (req, res, next) {
            var allowedQueryParams = REQUEST_QUERY_PARAMS_WHITELIST;

            if (Array.isArray(req.context.allowedQueryParams)) {
                allowedQueryParams = allowedQueryParams.concat(req.context.allowedQueryParams);
            }

            req.query = _.pick(req.query, allowedQueryParams);

            next();
        },
        function parseTokenParam (req, res, next) {
            if (!req.params.token) {
                return next();
            }

            var user = req.context.user;

            // Token might match the following patterns:
            // - {user}@{tpl_id}@{token}:{cache_buster}
            var tksplit = req.params.token.split(':');

            req.params.token = tksplit[0];

            if ( tksplit.length > 1 ) {
                req.params.cache_buster= tksplit[1];
            }

            tksplit = req.params.token.split('@');

            if ( tksplit.length > 1 ) {
                req.params.signer = tksplit.shift();

                if ( ! req.params.signer ) {
                    req.params.signer = user;
                } else if ( req.params.signer !== user ) {
                    var err = new Error(
                        `Cannot use map signature of user "${req.params.signer}" on db of user "${user}"`
                    );
                    err.http_status = 403;
                    req.profiler.done('req2params');

                    return next(err);
                }

                // skip template hash
                if (tksplit.length > 1) {
                    tksplit.shift();
                }

                req.params.token = tksplit.shift();
            }

            next();
        },
        function prepareContext (req, res, next) {
            var user = req.context.user;

            // bring all query values onto req.params object
            _.extend(req.params, req.query);

            // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
            // parse url params to an object and it's performed after matching path and controller.
            req.locals = {};
            _.extend(req.locals, req.params);

            req.profiler.done('req2params.setup');

            step(
                function getPrivacy(){
                    authApi.authorize(req, this);
                },
                function validateAuthorization(err, authorized) {
                    req.profiler.done('authorize');
                    assert.ifError(err);
                    if(!authorized) {
                        err = new Error("Sorry, you are unauthorized (permission denied)");
                        err.http_status = 403;
                        throw err;
                    }
                    return null;
                },
                function getDatabase(err){
                    assert.ifError(err);
                    pgConnection.setDBConn(user, req.params, this);
                },
                function finishSetup(err) {
                    if ( err ) {
                        if (err.message && -1 !== err.message.indexOf('name not found')) {
                            err.http_status = 404;
                        }
                        req.profiler.done('req2params');
                        return next(err, req);
                    }

                    // Add default database connection parameters
                    // if none given
                    _.defaults(req.params, {
                        dbuser: global.environment.postgres.user,
                        dbpassword: global.environment.postgres.password,
                        dbhost: global.environment.postgres.host,
                        dbport: global.environment.postgres.port
                    });

                    // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
                    // parse url params to an object and it's performed after matching path and controller.
                    _.defaults(req.locals, req.params);

                    req.profiler.done('req2params');
                    next(null, req);
                }
            );
        }
    ];
};
