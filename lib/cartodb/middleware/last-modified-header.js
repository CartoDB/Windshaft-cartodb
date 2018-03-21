module.exports = function setLastModifiedHeader ({ now = false } = {}) {
    return function setLastModifiedHeaderMiddleware(req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider, cache_buster } = res.locals;

        if (cache_buster) {
            const cacheBuster = parseInt(cache_buster, 10);
            const lastModifiedDate = Number.isFinite(cacheBuster) ? new Date(cacheBuster) : new Date();

            res.set('Last-Modified', lastModifiedDate.toUTCString());

            return next();
        }

        // REVIEW: to keep 100% compatibility with maps controller
        if (now) {
            res.set('Last-Modified', new Date().toUTCString());

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

            next();
        });
    };
};
