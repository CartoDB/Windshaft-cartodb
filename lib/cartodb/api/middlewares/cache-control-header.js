'use strict';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const FIVE_MINUTES_IN_SECONDS = 60 * 5;
const FALLBACK_TTL = global.environment.varnish.fallbackTtl || FIVE_MINUTES_IN_SECONDS;

module.exports = function setCacheControlHeader ({
    ttl = ONE_YEAR_IN_SECONDS,
    fallbackTtl = FALLBACK_TTL,
    revalidate = false
} = {}) {
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

            const directives = [ 'public' ];

            if (everyAffectedTablesCanBeInvalidated(affectedTables)) {
                directives.push(`max-age=${ttl}`);
            } else {
                directives.push(`max-age=${fallbackTtl}`);
            }

            if (revalidate) {
                directives.push('must-revalidate');
            }

            res.set('Cache-Control', directives.join(','));

            next();
        });
    };
};

function everyAffectedTablesCanBeInvalidated (affectedTables) {
    return affectedTables && affectedTables.getTables().every(table => !!table.updated_at);
}
