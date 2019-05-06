'use strict';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

module.exports = function setCacheControlHeader ({ ttl = ONE_YEAR_IN_SECONDS, revalidate = false } = {}) {
    return function setCacheControlHeaderMiddleware (req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const directives = [ 'public', `max-age=${ttl}` ];

        if (revalidate) {
            directives.push('must-revalidate');
        }

        res.set('Cache-Control', directives.join(','));

        next();
    };
};
