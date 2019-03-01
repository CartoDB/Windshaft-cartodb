'use strict';

module.exports = function sendResponse () {
    return function sendResponseMiddleware (req, res) {
        req.profiler.done('res');

        res.status(res.statusCode);

        if (Buffer.isBuffer(res.body)) {
            return res.send(res.body);
        }

        if (req.query.callback) {
            return res.jsonp(res.body);
        }

        res.json(res.body);
    };
};
