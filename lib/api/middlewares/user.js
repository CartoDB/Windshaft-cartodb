'use strict';

const CdbRequest = require('../../models/cdb-request');

module.exports = function user (metadataBackend) {
    const cdbRequest = new CdbRequest();

    return function userMiddleware (req, res, next) {
        res.locals.user = getUserNameFromRequest(req, cdbRequest);

        getUserId(metadataBackend, res.locals.user, function (userId) {
            if (userId) {
                res.locals.userId = userId;
            }
            return next();
        });
    };
};

function getUserNameFromRequest (req, cdbRequest) {
    return cdbRequest.userByReq(req);
}

function getUserId (metadataBackend, userName, callback) {
    metadataBackend.getUserId(userName, function (err, userId) {
        if (err) {
            return callback();
        }
        return callback(userId);
    });
}
