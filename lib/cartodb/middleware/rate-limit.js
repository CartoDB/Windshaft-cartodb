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
    return function rateLimitMiddleware(req, res, next) {
        if (!global.environment.enabledFeatures.rateLimitsEnabled) {
            return next();
        }

        const user = res.locals.user;

        if (!endpointGroup || !isRateLimitEnabledByEndpoint(endpointGroup)) {
            return next();
        }

        userLimitsApi.getRateLimit(user, endpointGroup, function(err, rateLimit) {
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
                const err = new Error('You are over the limits.');
                err.http_status = 429;
                return next(err);
            }
    
            return next();
        });
    };
}


function isRateLimitEnabledByEndpoint(endpointGroup) {
    return global.environment.enabledFeatures.rateLimitsByEndpoint[endpointGroup] === true;
}


module.exports = rateLimitFn;
module.exports.RATE_LIMIT_ENDPOINTS_GROUPS = RATE_LIMIT_ENDPOINTS_GROUPS;
