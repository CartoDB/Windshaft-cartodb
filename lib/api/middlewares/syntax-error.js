'use strict';

module.exports = function syntaxError () {
    return function syntaxErrorMiddleware (err, req, res, next) {
        if (err.name === 'SyntaxError') {
            err.http_status = 400;
            err.message = `${err.name}: ${err.message}`;
        }

        next(err);
    };
};
