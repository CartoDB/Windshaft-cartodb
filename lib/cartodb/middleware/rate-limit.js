'use strict';

const RATE_LIMIT_ENDPOINTS_GROUPS = {
    ANONYMOUS: 'anonymous',
    STATIC: 'static',
    STATIC_NAMED: 'static_named',
    DATAVIEW: 'dataview',
    DATAVIEW_SEARCH: 'dataview_search',
    ANALYSIS: 'analysis',
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

function rateLimitFn(userLimitsApi, endpointGroup = null) {
    if (isRateLimitEnabled(endpointGroup)) {
        return function rateLimitDisabledMiddleware(req, res, next) { next(); };
    }

    return function rateLimitMiddleware(req, res, next) {
        userLimitsApi.getRateLimit(res.locals.user, endpointGroup, function (err, rateLimit) {
            if (err) {
                return next(err);
            }

            if (!rateLimit) {
                return next();
            }

            const [isBlocked, limit, remaining, retry, reset] = rateLimit;

            res.set({
                'X-Rate-Limit-Limit': limit,
                'X-Rate-Limit-Remaining': remaining,
                'X-Rate-Limit-Retry-After': retry,
                'X-Rate-Limit-Reset': reset
            });

            if (isBlocked) {
                const rateLimitError = new Error('You are over the limits.');
                rateLimitError.http_status = 429;
                return next(rateLimitError);
            }

            return next();
        });
    };
}


function isRateLimitEnabled(endpointGroup) {
    return global.environment.enabledFeatures.rateLimitsEnabled &&
        endpointGroup &&
        global.environment.enabledFeatures.rateLimitsByEndpoint[endpointGroup];
}

module.exports = rateLimitFn;
module.exports.RATE_LIMIT_ENDPOINTS_GROUPS = RATE_LIMIT_ENDPOINTS_GROUPS;
