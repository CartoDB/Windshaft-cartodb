var assert = require('assert');

var _ = require('underscore');
var step = require('step');
var debug = require('debug')('windshaft:cartodb');

var LZMA = require('lzma').LZMA;
var lzmaWorker = new LZMA();

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

function BaseController(authApi, pgConnection) {
    this.authApi = authApi;
    this.pgConnection = pgConnection;
}

module.exports = BaseController;

// jshint maxcomplexity:10
/**
 * Whitelist input and get database name & default geometry type from
 * subdomain/user metadata held in CartoDB Redis
 * @param req - standard express request obj. Should have host & table
 * @param callback
 */
BaseController.prototype.req2params = function(req, res, next) {
    var self = this;

    if ( req.query.lzma ) {

        // Decode (from base64)
        var lzma = new Buffer(req.query.lzma, 'base64')
            .toString('binary')
            .split('')
            .map(function(c) {
                return c.charCodeAt(0) - 128;
            });


        // Decompress
        lzmaWorker.decompress(
            lzma,
            function(result) {
                req.profiler.done('lzma');
                try {
                    delete req.query.lzma;
                    _.extend(req.query, JSON.parse(result));
                    self.req2params(req, res, next);
                } catch (err) {
                    req.profiler.done('req2params');
                    next(new Error('Error parsing lzma as JSON: ' + err));
                }
            }
        );
        return;
    }

    var allowedQueryParams = REQUEST_QUERY_PARAMS_WHITELIST;
    if (Array.isArray(req.context.allowedQueryParams)) {
        allowedQueryParams = allowedQueryParams.concat(req.context.allowedQueryParams);
    }
    req.query = _.pick(req.query, allowedQueryParams);
    req.params = _.extend({}, req.params); // shuffle things as request is a strange array/object

    var user = req.context.user;

    if ( req.params.token ) {
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
            }
            else if ( req.params.signer !== user ) {
                var err = new Error(
                        'Cannot use map signature of user "' + req.params.signer + '" on db of user "' + user + '"'
                );
                err.http_status = 403;
                req.profiler.done('req2params');
                next(err);
                return;
            }
            if ( tksplit.length > 1 ) {
                /*var template_hash = */tksplit.shift(); // unused
            }
            req.params.token = tksplit.shift();
        }
    }

    // bring all query values onto req.params object
    _.extend(req.params, req.query);

    // FIXME: Temporary hack to share data between middlewares. Express overrides req.params to
    // parse url params to an object and it's performed after matching path and controller.
    req.locals = {};
    _.extend(req.locals, req.params);

    req.profiler.done('req2params.setup');

    step(
        function getPrivacy(){
            self.authApi.authorize(req, this);
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
            self.pgConnection.setDBConn(user, req.params, this);
        },
        function finishSetup(err) {
            if ( err ) {
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
};
// jshint maxcomplexity:6

// jshint maxcomplexity:9
BaseController.prototype.send = function(req, res, body, status, headers) {
    if (req.params.dbhost) {
        res.set('X-Served-By-DB-Host', req.params.dbhost);
    }

    res.set('X-Tiler-Profiler', req.profiler.toJSONString());

    if (headers) {
        res.set(headers);
    }

    res.status(status);

    if (!Buffer.isBuffer(body) && typeof body === 'object') {
        if (req.query && req.query.callback) {
            res.jsonp(body);
        } else {
            res.json(body);
        }
    } else {
        res.send(body);
    }

    try {
        // May throw due to dns, see
        // See http://github.com/CartoDB/Windshaft/issues/166
        req.profiler.sendStats();
    } catch (err) {
        debug("error sending profiling stats: " + err);
    }
};
// jshint maxcomplexity:6
