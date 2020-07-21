'use strict';

module.exports = function setCacheChannelHeader () {
    return function setCacheChannelHeaderMiddleware (req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider, logger } = res.locals;

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                logger.warn({ exception: err }, 'Error generating Cache Channel Header');
                return next();
            }

            if (!affectedTables) {
                return next();
            }

            res.set('X-Cache-Channel', affectedTables.getCacheChannel());

            next();
        });
    };
};
