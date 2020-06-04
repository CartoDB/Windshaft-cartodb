'use strict';

module.exports = function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware (req, res, next) {
        const { mapConfig, user, logger } = res.locals;
        const statTag = mapConfig.obj().stat_tag;

        if (statTag) {
            res.set('Carto-Stat-Tag', `${statTag}`);
        }

        // Error won't blow up, just be logged.
        metadataBackend.incMapviewCount(user, statTag, (err) => {
            if (err) {
                err.message = `Failed to increment mapview count for user '${user}'. ${err.message}`;
                logger.warn({ error: err });
            }

            next();
        });
    };
};
