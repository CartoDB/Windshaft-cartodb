'use strict';

const ONE_MINUTE_IN_SECONDS = 60;
const THREE_MINUTE_IN_SECONDS = 60 * 3;
const FIVE_MINUTES_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 5;
const TEN_MINUTES_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 10;
const FIFTEEN_MINUTES_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 15;
const THIRTY_MINUTES_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 30;
const ONE_HOUR_IN_SECONDS = ONE_MINUTE_IN_SECONDS * 60;
const ONE_YEAR_IN_SECONDS = ONE_HOUR_IN_SECONDS * 24 * 365;

const FALLBACK_TTL = global.environment.varnish.fallbackTtl || FIVE_MINUTES_IN_SECONDS;

const validFallbackTTL = [
    ONE_MINUTE_IN_SECONDS,
    THREE_MINUTE_IN_SECONDS,
    FIVE_MINUTES_IN_SECONDS,
    TEN_MINUTES_IN_SECONDS,
    FIFTEEN_MINUTES_IN_SECONDS,
    THIRTY_MINUTES_IN_SECONDS,
    ONE_HOUR_IN_SECONDS
];

module.exports = function setCacheControlHeader ({
    ttl = ONE_YEAR_IN_SECONDS,
    fallbackTtl = FALLBACK_TTL,
    revalidate = false
} = {}) {
    if (!validFallbackTTL.includes(fallbackTtl)) {
        const message = [
            'Invalid fallback TTL value for Cache-Control header.',
            `Got ${fallbackTtl}, expected ${validFallbackTTL.join(', ')}`
        ].join(' ');

        throw new Error(message);
    }

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

            const directives = ['public'];

            if (everyAffectedTableCanBeInvalidated(affectedTables)) {
                directives.push(`max-age=${ttl}`);
            } else {
                directives.push(`max-age=${computeNextTTL({ ttlInSeconds: fallbackTtl })}`);
            }

            if (revalidate) {
                directives.push('must-revalidate');
            }

            res.set('Cache-Control', directives.join(','));

            next();
        });
    };
};

function everyAffectedTableCanBeInvalidated (affectedTables) {
    const skipNotUpdatedAtTables = false;
    const skipAnalysisCachedTables = true;

    return affectedTables &&
        affectedTables.getTables(skipNotUpdatedAtTables, skipAnalysisCachedTables)
            .every(table => table.updated_at !== null);
}

function computeNextTTL ({ ttlInSeconds } = {}) {
    const nowInSeconds = Math.ceil(Date.now() / 1000);
    const secondsAfterPreviousTTLStep = nowInSeconds % ttlInSeconds;
    const secondsToReachTheNextTTLStep = ttlInSeconds - secondsAfterPreviousTTLStep;

    return secondsToReachTheNextTTLStep;
}
