'use strict';

const setCommonHeaders = require('../../utils/common-headers');

module.exports = function errorMiddleware (/* options */) {
    return function error (err, req, res, next) {
        const { logger } = res.locals;
        const errors = populateLimitErrors(Array.isArray(err) ? err : [err]);

        logger.error({ error: errors });

        setCommonHeaders(req, res, () => {
            const errorResponseBody = {
                errors: errors.map(errorMessage),
                errors_with_context: errors.map(errorMessageWithContext)
            };

            // If a callback was requested, force status to 200
            res.status(req.query.callback ? 200 : findStatusCode(errors[0]));

            if (req.query && req.query.callback) {
                res.jsonp(errorResponseBody);
            } else {
                res.json(errorResponseBody);
            }

            return next();
        });
    };
};

function isRenderTimeoutError (err) {
    return err.message === 'Render timed out';
}

function isDatasourceTimeoutError (err) {
    return err.message && err.message.match(/canceling statement due to statement timeout/i);
}

function isTimeoutError (errorTypes) {
    return errorTypes.renderTimeoutError || errorTypes.datasourceTimeoutError;
}

function getErrorTypes (error) {
    return {
        renderTimeoutError: isRenderTimeoutError(error),
        datasourceTimeoutError: isDatasourceTimeoutError(error)
    };
}

function isMaxWaitingClientsError (err) {
    return err.message === 'max waitingClients count exceeded';
}

function populateLimitErrors (errors) {
    return errors.map(function (error) {
        if (isMaxWaitingClientsError(error)) {
            error.message = 'You are over platform\'s limits: Max render capacity exceeded.' +
                ' Contact CARTO support for more details.';
            error.type = 'limit';
            error.subtype = 'render-capacity';
            error.http_status = 429;

            return error;
        }

        const errorTypes = getErrorTypes(error);

        if (isTimeoutError(errorTypes)) {
            error.message = 'You are over platform\'s limits. Please contact us to know more details';
            error.type = 'limit';
            error.http_status = 429;
        }

        if (errorTypes.datasourceTimeoutError) {
            error.subtype = 'datasource';
            error.message = 'You are over platform\'s limits: SQL query timeout error.' +
                ' Refactor your query before running again or contact CARTO support for more details.';
        }

        if (errorTypes.renderTimeoutError) {
            error.subtype = 'render';
            error.message = 'You are over platform\'s limits: Render timeout error.' +
                ' Contact CARTO support for more details.';
        }

        return error;
    });
}

function findStatusCode (err) {
    var statusCode;
    if (err.http_status) {
        statusCode = err.http_status;
    } else {
        statusCode = statusFromErrorMessage('' + err);
    }
    return statusCode;
}

module.exports.findStatusCode = findStatusCode;

function statusFromErrorMessage (errMsg) {
    // Find an appropriate statusCode based on message
    var statusCode = 400;
    if (errMsg.indexOf('permission denied') !== -1) {
        statusCode = 403;
    } else if (errMsg.indexOf('authentication failed') !== -1) {
        statusCode = 403;
    } else if (errMsg.match(/Postgis Plugin.*[\s|\n].*column.*does not exist/)) {
        statusCode = 400;
    } else if (errMsg.indexOf('does not exist') !== -1) {
        if (errMsg.indexOf(' role ') !== -1) {
            statusCode = 403; // role 'xxx' does not exist
        } else if (errMsg.match(/function .* does not exist/)) {
            statusCode = 400; // invalid SQL (SQL function does not exist)
        } else {
            statusCode = 404;
        }
    }

    return statusCode;
}

function errorMessage (err) {
    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
    var message = (typeof err === 'string' ? err : err.message) || 'Unknown error';

    return stripConnectionInfo(message);
}

module.exports.errorMessage = errorMessage;

function stripConnectionInfo (message) {
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

function errorMessageWithContext (err) {
    // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
    var message = (typeof err === 'string' ? err : err.message) || 'Unknown error';

    var error = {
        type: err.type || 'unknown',
        message: stripConnectionInfo(message)
    };

    for (var prop in err) {
        // type & message are properties from Error's prototype and will be skipped
        if (Object.prototype.hasOwnProperty.call(err, prop) && shouldBeExposed(prop)) {
            error[prop] = err[prop];
        }
    }

    return error;
}
