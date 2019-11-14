'use strict';

module.exports = function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware (req, res, next) {
        const { mapConfig, user } = res.locals;

        // Error won't blow up, just be logged.
        metadataBackend.incMapviewCount(user, mapConfig.obj().stat_tag, (err) => {
            req.profiler.done('incMapviewCount');

            if (err) {
                global.logger.log(`ERROR: failed to increment mapview count for user '${user}': ${err.message}`);
            }

            next();
        });
    };
};
