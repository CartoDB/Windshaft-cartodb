
module.exports = function populateTimeouts () {
    return function populateTimeoutsMiddleware(errors, req, res, next) {
        const populatedErrors = errors.map(error => {
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

        next(populatedErrors);
    };
};

function isTimeoutError (err) {
    return isRenderTimeoutError(err) || isDatasourceTimeoutError(err);
}

function isRenderTimeoutError (err) {
    return err.message === 'Render timed out';
}

function isDatasourceTimeoutError (err) {
    return err.message && err.message.match(/canceling statement due to statement timeout/i);
}
