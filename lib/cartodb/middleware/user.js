var CdbRequest = require('../models/cdb_request');
var cdbRequest = new CdbRequest();

module.exports = function userMiddleware(req, res, next) {
    req.context.user = cdbRequest.userByReq(req);
    next();
};
