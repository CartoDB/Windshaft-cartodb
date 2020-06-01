'use strict';

module.exports = function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware (req, res, next) {
        const { mapConfig, user } = res.locals;
        const statTag = mapConfig.obj().stat_tag;

        if (statTag) {
            res.set('Carto-Stat-Tag', `${statTag}`);
        }

        // Error won't blow up, just be logged.
        metadataBackend.incMapviewCount(user, statTag, (err) => {
            req.profiler.done('incMapviewCount');

            if (err) {
                global.logger.warn(err, `ERROR: failed to increment mapview count for user '${user}'`);
            }

            next();
        });
    };
};
