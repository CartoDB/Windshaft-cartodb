const _ = require('underscore');
const debug = require('debug')('windshaft:cartodb:error-middleware');

module.exports = function errorMiddleware (/* options */) {
    return function error (err, req, res, next) {
        // jshint unused:false
        // jshint maxcomplexity:9
        var allErrors = Array.isArray(err) ? err : [err];

        allErrors = populateTimeoutErrors(allErrors);

        const label = err.label || 'UNKNOWN';
        err = allErrors[0] || new Error(label);
        allErrors[0] = err;

        var statusCode = findStatusCode(err);

        if (err.message === 'Tile does not exist' && res.locals.format === 'mvt') {
            statusCode = 204;
        }
        
        logErrors(allErrors, statusCode, res);
        debug('[%s ERROR] -- %d: %s, %s', label, statusCode, err, err.stack);

        // If a callback was requested, force status to 200
        if (req.query && req.query.callback) {
            statusCode = 200;
        }

        var errorResponseBody = {
            errors: allErrors.map(errorMessage),
            errors_with_context: allErrors.map(errorMessageWithContext)
        };

        res.status(statusCode);

        if (req.query && req.query.callback) {
            res.jsonp(errorResponseBody);
        } else {
            res.json(errorResponseBody);
        }
    };
};

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

function errorMessage(err) {
    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
    var message = (_.isString(err) ? err : err.message) || 'Unknown error';

    return stripConnectionInfo(message);
}

module.exports.errorMessage = errorMessage;

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

function logErrors(errors, statusCode, res) {
    let errorsCopy = errors.slice(0);
    
    if(!errorsCopy || !errorsCopy.length) {
        return;
    }
    
    const mainError = errorsCopy.shift();

    let errorsLog = {
        statusCode: statusCode || 200,
        message:    mainError.message,
        name:       mainError.name,
        label:      mainError.label,
        type:       mainError.type,
        subtype:    mainError.subtype
    };

    errorsLog.moreErrors = errorsCopy.map(error => {
        return {
            message: error.message,
            name:    error.name,
            label:   error.label,
            type:    error.type,
            subtype: error.subtype
        };
    });
    
    res.set('X-Tiler-Errors', JSON.stringify(errorsLog));
}
