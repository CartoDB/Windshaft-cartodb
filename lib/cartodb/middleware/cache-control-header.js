module.exports = function setCacheControlHeader ({ ttl = 31536000, revalidate = false } = {}) {
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
}
