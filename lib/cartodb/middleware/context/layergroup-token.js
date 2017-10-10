var LayergroupToken = require('../../models/layergroup-token');

module.exports = function layergroupTokenMiddleware(req, res, next) {
    if (!res.locals.token) {
        return next();
    }

    var user = res.locals.user;

    var layergroupToken = LayergroupToken.parse(res.locals.token);
    res.locals.token = layergroupToken.token;
    res.locals.cache_buster = layergroupToken.cacheBuster;

    if (layergroupToken.signer) {
        res.locals.signer = layergroupToken.signer;
        if (!res.locals.signer) {
            res.locals.signer = user;
        } else if (res.locals.signer !== user) {
            var err = new Error(`Cannot use map signature of user "${res.locals.signer}" on db of user "${user}"`);
            err.type = 'auth';
            err.http_status = 403;
            if (req.query && req.query.callback) {
                err.http_status = 200;
            }
            
            req.profiler.done('req2params');
            return next(err);
        }
    }

    return next();
};
