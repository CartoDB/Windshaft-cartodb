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
BaseController.prototype.req2params = function(req, callback){
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
                    self.req2params(req, callback);
                } catch (err) {
                    req.profiler.done('req2params');
                    callback(new Error('Error parsing lzma as JSON: ' + err));
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
                callback(err);
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
                return callback(err, req);
            }

            // Add default database connection parameters
            // if none given
            _.defaults(req.params, {
                dbuser: global.environment.postgres.user,
                dbpassword: global.environment.postgres.password,
                dbhost: global.environment.postgres.host,
                dbport: global.environment.postgres.port
            });

            req.profiler.done('req2params');
            callback(null, req);
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

BaseController.prototype.sendError = function(req, res, err, label) {
    var allErrors = Array.isArray(err) ? err : [err];

    allErrors = populateTimeoutErrors(allErrors);

    label = label || 'UNKNOWN';
    err = allErrors[0] || new Error(label);
    allErrors[0] = err;

    var statusCode = findStatusCode(err);

    if (err.message === 'Tile does not exist' && req.params.format === 'mvt') {
        statusCode = 204;
    }

    debug('[%s ERROR] -- %d: %s, %s', label, statusCode, err, err.stack);

    // If a callback was requested, force status to 200
    if (req.query && req.query.callback) {
        statusCode = 200;
    }

    var errorResponseBody = {
        errors: allErrors.map(errorMessage),
        errors_with_context: allErrors.map(errorMessageWithContext)
    };

    this.send(req, res, errorResponseBody, statusCode);
};

function stripConnectionInfo(message) {
    // Strip connection info, if any
    return message
        // See https://github.com/CartoDB/Windshaft/issues/173
        .replace(/Connection string: '[^']*'\n\s/im, '')
        // See https://travis-ci.org/CartoDB/Windshaft/jobs/20703062#L1644
        .replace(/is the server.*encountered/im, 'encountered');
}

var ERROR_INFO_TO_EXPOSE = {
    message: true,
    layer: true,
    type: true,
    analysis: true,
    subtype: true
};

function shouldBeExposed (prop) {
    return !!ERROR_INFO_TO_EXPOSE[prop];
}

function errorMessage(err) {
    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
    var message = (_.isString(err) ? err : err.message) || 'Unknown error';

    return stripConnectionInfo(message);
}

function errorMessageWithContext(err) {
    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
    var message = (_.isString(err) ? err : err.message) || 'Unknown error';

    var error = {
        type: err.type || 'unknown',
        message: stripConnectionInfo(message),
    };

    for (var prop in err) {
        // type & message are properties from Error's prototype and will be skipped
        if (err.hasOwnProperty(prop) && shouldBeExposed(prop)) {
            error[prop] = err[prop];
        }
    }

    return error;
}
module.exports.errorMessage = errorMessage;

function findStatusCode(err) {
    var statusCode;
    if ( err.http_status ) {
        statusCode = err.http_status;
    } else {
        statusCode = statusFromErrorMessage('' + err);
    }
    return statusCode;
}
module.exports.findStatusCode = findStatusCode;

function statusFromErrorMessage(errMsg) {
    // Find an appropriate statusCode based on message
    // jshint maxcomplexity:7
    var statusCode = 400;
    if ( -1 !== errMsg.indexOf('permission denied') ) {
        statusCode = 403;
    }
    else if ( -1 !== errMsg.indexOf('authentication failed') ) {
        statusCode = 403;
    }
    else if (errMsg.match(/Postgis Plugin.*[\s|\n].*column.*does not exist/)) {
        statusCode = 400;
    }
    else if ( -1 !== errMsg.indexOf('does not exist') ) {
        if ( -1 !== errMsg.indexOf(' role ') ) {
            statusCode = 403; // role 'xxx' does not exist
        } else if ( errMsg.match(/function .* does not exist/) ) {
            statusCode = 400; // invalid SQL (SQL function does not exist)
        } else {
            statusCode = 404;
        }
    }

    return statusCode;
}

function isRenderTimeoutError (err) {
    return err.message === 'Render timed out';
}

function isDatasourceTimeoutError (err) {
    return err.message && err.message.match(/canceling statement due to statement timeout/i);
}

function isTimeoutError (err) {
    return isRenderTimeoutError(err) || isDatasourceTimeoutError(err);
}

function populateTimeoutErrors (errors) {
    return errors.map(function (error) {
        if (isRenderTimeoutError(error)) {
            error.subtype = 'render';
        }

        if (isDatasourceTimeoutError(error)) {
            error.subtype = 'datasource';
        }

        if (isTimeoutError(error)) {
            error.message = 'You are over platform\'s limits. Please contact us to know more details';
            error.type = 'limit';
            error.http_status = 429;
        }

        return error;
    });
}
