'use strict';

const CdbRequest = require('../../models/cdb-request');

module.exports = function user (metadataBackend) {
    const cdbRequest = new CdbRequest();

    return function userMiddleware (req, res, next) {
        try {
            res.locals.user = getUserNameFromRequest(req, cdbRequest);
            res.locals.logger.info({ 'cdb-user': res.locals.user }, 'User');
        } catch (err) {
            return next(err);
        }

        metadataBackend.getUserId(res.locals.user, (err, userId) => {
            if (err || !userId) {
                return next();
            }

            res.locals.userId = userId;

            return next();
        });
    };
};

function getUserNameFromRequest (req, cdbRequest) {
    return cdbRequest.userByReq(req);
}
