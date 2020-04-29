'use strict';

module.exports = function setLastModifiedHeader () {
    return function setLastModifiedHeaderMiddleware (req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider, cache_buster: cacheBuster } = res.locals;

        if (cacheBuster) {
            const cacheBusterTimestamp = parseInt(cacheBuster, 10);
            const lastModifiedDate = Number.isFinite(cacheBusterTimestamp) && cacheBusterTimestamp !== 0
                ? new Date(cacheBusterTimestamp)
                : new Date();

            res.set('Last-Modified', lastModifiedDate.toUTCString());

            return next();
        }

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                global.logger.warn('ERROR generating Last Modified Header:', err);
                return next();
            }

            if (!affectedTables) {
                res.set('Last-Modified', new Date().toUTCString());

                return next();
            }

            const lastUpdatedAt = affectedTables.getLastUpdatedAt();
            const lastModifiedDate = Number.isFinite(lastUpdatedAt) ? new Date(lastUpdatedAt) : new Date();

            res.set('Last-Modified', lastModifiedDate.toUTCString());

            res.locals.cache_buster = lastUpdatedAt;

            next();
        });
    };
};
