'use strict';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const FIVE_MINUTES_IN_SECONDS = 60 * 5;

module.exports = function setCacheControlHeader ({ ttl = ONE_YEAR_IN_SECONDS, revalidate = false } = {}) {
    return function setCacheControlHeaderMiddleware (req, res, next) {
        if (req.method !== 'GET') {
            return next();
        }

        const { mapConfigProvider = { getAffectedTables: callback => callback() } } = res.locals;

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                global.logger.warn('ERROR generating Cache Control Header:', err);
                return next();
            }

            if (affectedTables && !affectedTables.getTables().some(table => !!table.updated_at)) {
                ttl = FIVE_MINUTES_IN_SECONDS;
            }

            const directives = [ 'public', `max-age=${ttl}` ];

            if (revalidate) {
                directives.push('must-revalidate');
            }

            res.set('Cache-Control', directives.join(','));

            next();
        });
    };
};
