const debug = require('debug')('windshaft:cartodb:error-middleware:status-code');

module.exports = function statusCode () {
    return function statusCodeMiddleware(errors, req, res, next) {
        const  err = errors[0]; 
        
        debug(
            '[%s ERROR] -- %d: %s, %s', 
            err.label || err.message, 
            statusCode, 
            err, 
            err.stack
        );
    };
};