module.exports = function setLastModifiedHeader () {
    return function setLastModifiedHeaderMiddleware(req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider, cache_buster } = res.locals;

        if (cache_buster) {
            const cacheBuster = parseInt(cache_buster, 10);

            if (Number.isFinite(cacheBuster)) {
                res.set('Last-Modified',  new Date(cacheBuster).toUTCString());
            }

            return next();
        }

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                global.logger.warn('ERROR generating Last Modified Header:', err);
                return next();
            }

            if (!affectedTables) {
                return next();
            }

            const lastUpdatedAt = affectedTables.getLastUpdatedAt();

            const lastModifiedDate = Number.isFinite(lastUpdatedAt) ?
                new Date(lastUpdatedAt) :
                new Date();

            res.set('Last-Modified', lastModifiedDate.toUTCString());

            next();
        });
    };
};
