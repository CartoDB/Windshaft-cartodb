'use strict';

const CdbRequest = require('../../models/cdb_request');
const cdbRequest = new CdbRequest();

module.exports = () => (req, res, next) => {
    res.locals.user = cdbRequest.userByReq(req);

    // avoid a req.params.user equals to undefined
    // overwrites res.locals.user
    if(!req.params.user) {
        delete req.params.user;
    }

    next();
};
