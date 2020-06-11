'use strict';

module.exports = function tag ({ tags }) {
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
        throw new Error('Required "tags" option must be a valid Array: [string, string, ...]');
    }

    return function tagMiddleware (req, res, next) {
        const { logger } = res.locals;
        res.locals.tags = tags;
        res.on('finish', () => logger.info({ tags: res.locals.tags }));

        next();
    };
};
