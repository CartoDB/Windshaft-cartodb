'use strict';

const RATE_LIMIT_ENDPOINTS_GROUPS = {
    ANONYMOUS: 'anonymous',
    STATIC: 'static',
    STATIC_NAMED: 'static_named',
    DATAVIEW: 'dataview',
    DATAVIEW_SEARCH: 'dataview_search',
    ANALYSIS: 'analysis',
    ANALYSIS_CATALOG: 'analysis_catalog',
    TILE: 'tile',
    ATTRIBUTES: 'attributes',
    NAMED_LIST: 'named_list',
    NAMED_CREATE: 'named_create',
    NAMED_GET: 'named_get',
    NAMED: 'named',
    NAMED_UPDATE: 'named_update',
    NAMED_DELETE: 'named_delete',
    NAMED_TILES: 'named_tiles'
};

function rateLimit (userLimitsBackend, endpointGroup = null) {
    if (!isRateLimitEnabled(endpointGroup)) {
        return function rateLimitDisabledMiddleware (req, res, next) { next(); };
    }

    return function rateLimitMiddleware (req, res, next) {
        userLimitsBackend.getRateLimit(res.locals.user, endpointGroup, function (err, userRateLimit) {
            if (err) {
                return next(err);
            }

            if (!userRateLimit) {
                return next();
            }

            const [isBlocked, limit, remaining, retry, reset] = userRateLimit;

            res.set({
                'Carto-Rate-Limit-Limit': limit,
                'Carto-Rate-Limit-Remaining': remaining,
                'Carto-Rate-Limit-Reset': reset
            });

            if (isBlocked) {
                // retry is floor rounded in seconds by redis-cell
                res.set('Retry-After', retry + 1);

                const rateLimitError = new Error(
                    'You are over platform\'s limits: too many requests.' +
                    ' Please contact us to know more details'
                );
                rateLimitError.http_status = 429;
                rateLimitError.type = 'limit';
                rateLimitError.subtype = 'rate-limit';
                return next(rateLimitError);
            }

            return next();
        });
    };
}

function isRateLimitEnabled (endpointGroup) {
    return global.environment.enabledFeatures.rateLimitsEnabled &&
        endpointGroup &&
        global.environment.enabledFeatures.rateLimitsByEndpoint[endpointGroup];
}

module.exports = rateLimit;
module.exports.RATE_LIMIT_ENDPOINTS_GROUPS = RATE_LIMIT_ENDPOINTS_GROUPS;
