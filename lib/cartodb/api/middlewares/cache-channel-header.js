'use strict';

module.exports = function setCacheChannelHeader () {
    return function setCacheChannelHeaderMiddleware (req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider } = res.locals;

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                global.logger.warn('ERROR generating Cache Channel Header:', err);
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
