'use strict';

const setCommonHeaders = require('../../utils/common-headers');

module.exports = function sendResponse () {
    return function sendResponseMiddleware (req, res, next) {
        setCommonHeaders(req, res, () => {
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
        });
    };
};
