const LayergroupToken = require('../../models/layergroup-token');
const authErrorMessageTemplate = function (signer, user) {
    return `Cannot use map signature of user "${signer}" on db of user "${user}"`;
};

module.exports = function layergroupToken () {
    return function layergroupTokenMiddleware (req, res, next) {
        if (!res.locals.token) {
            return next();
        }

        const user = res.locals.user;

        const layergroupToken = LayergroupToken.parse(res.locals.token);

        res.locals.token = layergroupToken.token;
        res.locals.cache_buster = layergroupToken.cacheBuster;

        if (layergroupToken.signer) {
            res.locals.signer = layergroupToken.signer;

            if (res.locals.signer !== user) {
                const err = new Error(authErrorMessageTemplate(res.locals.signer, user));
                err.type = 'auth';
                err.http_status = (req.query && req.query.callback) ? 200: 403;

                return next(err);
            }
        }

        return next();
    };
};
