'use strict';

module.exports = function sendResponse () {
    return function sendResponseMiddleware (req, res, next) {
        req.profiler.done('res');

        res.status(res.statusCode);

        if (Buffer.isBuffer(res.body)) {
            res.send(res.body);
            return next();
        }

        if (req.query.callback) {
            res.jsonp(res.body);
            return next();
        }

        res.json(res.body);
        return next();
    };
};
