'use strict';

const CdbRequest = require('../../models/cdb-request');

module.exports = function user (metadataBackend) {
    const cdbRequest = new CdbRequest();

    return function userMiddleware (req, res, next) {
        res.locals.user = getUserNameFromRequest(req, cdbRequest);

        metadataBackend.getUserId(res.locals.user, (err, userId) => {
            if (err || !userId) {
                return next();
            }

            res.locals.userId = userId;
            res.set('Carto-User-Id', `${userId}`);
            return next();
        });
    };
};

function getUserNameFromRequest (req, cdbRequest) {
    return cdbRequest.userByReq(req);
}
