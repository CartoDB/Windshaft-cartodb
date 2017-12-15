'use strict';

/*
    Adds HTTP headers:
    - X-Served-By-DB-Host
*/

module.exports = () => function addHTTPHeadersMiddleware(req, res, next) {
    res.set('X-Served-By-DB-Host', res.locals.db.host);
    next();
};
