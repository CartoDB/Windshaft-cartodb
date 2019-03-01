'use strict';

module.exports = function initializeStatusCode () {
    return function initializeStatusCodeMiddleware (req, res, next) {
        if (req.method !== 'OPTIONS') {
            res.statusCode = 404;
        }

        next();
    };
};
