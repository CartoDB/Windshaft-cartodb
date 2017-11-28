'use strict';

const CdbRequest = require('../../models/cdb_request');
const cdbRequest = new CdbRequest();

module.exports = () => (req, res, next) => {
    res.locals.user = cdbRequest.userByReq(req);

    next();
};
