'use strict';

module.exports = function checkJsonContentType () {
    return function checkJsonContentTypeMiddleware (req, res, next) {
        if (req.method === 'POST' && !req.is('application/json')) {
            return next(new Error('POST data must be of type application/json'));
        }

        req.profiler.done('checkJsonContentTypeMiddleware');

        next();
    };
};
