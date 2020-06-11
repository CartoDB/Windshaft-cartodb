'use strict';

module.exports = function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware (req, res, next) {
        const { mapConfig, user, logger } = res.locals;
        const statTag = mapConfig.obj().stat_tag;

        metadataBackend.incMapviewCount(user, statTag, (err) => {
            if (err) {
                err.message = `Failed to increment mapview count for user '${user}'. ${err.message}`;
                logger.warn({ error: err });
            }

            next();
        });
    };
};
