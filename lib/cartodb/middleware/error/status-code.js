module.exports = function statusCode () {
    return function statusCodeMiddleware(errors, req, res, next) {
        let statusCode = 200;

        // If a callback was requested, force status to 200
        if (!req.query || !req.query.callback) {
            const err = errors[0];
            statusCode = findStatusCode(err, res.locals);
        }

        res.status(statusCode);        
        next(errors);
    };
};

function findStatusCode(err, locals) {
    let statusCode;
    if (err.message === 'Tile does not exist' && locals.format === 'mvt') {
        statusCode = 204;
    } else if ( err.http_status ) {
        statusCode = err.http_status;
    } else {
        statusCode = statusFromErrorMessage('' + err);
    }
    
    return statusCode;
}

function statusFromErrorMessage(errMsg) {
    // Find an appropriate statusCode based on message
    // jshint maxcomplexity:7
    let statusCode = 400;
    if ( -1 !== errMsg.indexOf('permission denied') ) {
        statusCode = 403;
    } else if ( -1 !== errMsg.indexOf('authentication failed') ) {
        statusCode = 403;
    } else if (errMsg.match(/Postgis Plugin.*[\s|\n].*column.*does not exist/)) {
        statusCode = 400;
    } else if ( -1 !== errMsg.indexOf('does not exist') ) {
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
