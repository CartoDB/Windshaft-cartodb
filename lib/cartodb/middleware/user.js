var CdbRequest = require('../models/cdb_request');
var cdbRequest = new CdbRequest();

module.exports = function userMiddleware(req, res, next) {
    res.locals.user = cdbRequest.userByReq(req);

    next();
};
