var LayergroupToken = require('../models/layergroup-token');

module.exports = function layergroupTokenMiddleware(req, res, next) {
    if (!req.params.hasOwnProperty('token')) {
        return next();
    }

    var user = req.context.user;

    var layergroupToken = LayergroupToken.parse(req.params.token);
    req.params.token = layergroupToken.token;
    req.params.cache_buster = layergroupToken.cacheBuster;

    if (layergroupToken.signer) {
        req.params.signer = layergroupToken.signer;
        if (!req.params.signer) {
            req.params.signer = user;
        } else if (req.params.signer !== user) {
            var statusCode = 403;
            if (req.query && req.query.callback) {
                statusCode = 200;
            }
            var errorMessage = `Cannot use map signature of user "${req.params.signer}" on db of user "{${user}"`;
            return res.status(statusCode).json({
                errors: [errorMessage],
                errors_with_context: [{
                    type: 'auth',
                    message: errorMessage
                }]
            });
        }
    }

    return next();
};
