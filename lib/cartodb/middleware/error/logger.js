const debug = require('debug')('windshaft:cartodb:error-middleware:logger');

module.exports = function logger () {
    return function loggerMiddleware(errors, req, res, next) {
        // jshint unused:false
        const  err = errors[0]; 
        
        debug(
            '[%s ERROR] -- %d: %s, %s', 
            err.label || err.message, 
            res.statusCode, 
            err, 
            err.stack
        );

        next(errors);
    };
};