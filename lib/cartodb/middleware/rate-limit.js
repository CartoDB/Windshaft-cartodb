'use strict';

const REDIS_DB = 8;

const RATE_LIMIT_ENDPOINTS_GROUPS = {
    ENDPOINT_1: 'anonymous',
    ENDPOINT_2: 'static',
    ENDPOINT_3: 'static_named',
    ENDPOINT_5: 'dataview',
    ENDPOINT_6: 'dataview_search',
    ENDPOINT_7: 'analysis',
    ENDPOINT_8: 'tile',
    ENDPOINT_9: 'attributes',
    ENDPOINT_10: 'named_list',
    ENDPOINT_11: 'named_create',
    ENDPOINT_12: 'named_get',
    ENDPOINT_13: 'named',
    ENDPOINT_14: 'named_update',
    ENDPOINT_15: 'named_delete',
    ENDPOINT_17: 'named_tiles'
};

function rateLimitMiddleware(metadataBackend, endpointGroup = null) {
    return function rateLimit(req, res, next) {
        if (!global.environment.enabledFeatures.rateLimitsEnabled) {
            return next();
        }

        const user = 'cdb';
        // const user = res.locals.user;
        if (!endpointGroup) {
            endpointGroup = getEndpointGroup();
        }

        if (!endpointGroup || !isRateLimitEnabledByEndpoint(endpointGroup)) {
            return next();
        }

        const redisParams = [
            getLuaScript(),
            2,
            getStoreKey(user, endpointGroup),   // KEY[1] 
            getStatusKey(user, endpointGroup)   // KEY[2]
        ];

        metadataBackend.redisCmd(REDIS_DB, 'EVAL', redisParams, function(err, rateLimits) {
            if (err) {
                return next(err);
            }
            
            const rateLimit = getLowerRateLimit(rateLimits);

            if (!rateLimit) {
                return next();
            }
            
            const isBloqued = rateLimit[0]; 
            const limit = rateLimit[1];
            const remaining = rateLimit[2];
            const retry = rateLimit[3];
            const reset = rateLimit[4];

            res.set({
                'X-Rate-Limit-Limit': limit,
                'X-Rate-Limit-Remaining': remaining,
                'X-Rate-Limit-Retry-After': retry,
                'X-Rate-Limit-Reset': reset
            });

            if (isBloqued) {
                const err = new Error('You are over the limits.');
                err.http_status = 429;
                return next(err);
            }

            return next();
        });
    };
}


/**
 * Returns the endpoint key in Redis
 */
function getEndpointGroup() {
    // TODO: get endpoint from route path
    return null;
}

/**
 * Returns Redis key where the limits are saved by user and endpoint
 * The value is a Redis hash:
 *    maxBurst (b): Integer (as string)
 *    countPerPeriod (c): Integer (as string)
 *    period (p): Integer (as string)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStoreKey(user, endpointGroup) {
    return `limits:rate:store:${user}:${endpointGroup}`;
}

/**
 * Returns Redis key where the current state of the limit by user and endpoint 
 * This key is managed by redis-cell (CL.THROTTLE command)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStatusKey(user, endpointGroup) {
    return `limits:rate:status:${user}:${endpointGroup}`;
}

function getLuaScript() {
    return `
        local results = {}
        local resultsCounter = 0
    
        local limits = {}
        local limitsArray = redis.call("LRANGE", KEYS[1], 0, -1)
        
        for i, v in ipairs(limitsArray) do
            local rest = i % 3
            if rest ~= 0 then
                limits[rest] = v
            else
                resultsCounter = resultsCounter + 1
                results[resultsCounter] = redis.call("CL.THROTTLE", KEYS[2], limits[1], limits[2], v)
            end
        end

        return results
    `;
}

/**
 * Returns the inner rateLimit what is the strictest one
 * @param {Array} ratelimits Each inner array has 5 integers indicating: 
 *      isBloqued, limit, remaining, retry, reset
 */
function getLowerRateLimit(ratelimits) {
    if (!ratelimits || !Array.isArray(ratelimits) || !ratelimits.length) {
        return;
    }

    if (ratelimits.length === 1) {
        return ratelimits[0];
    }

    let minIndex = 0;
    let minValue;
    let currentIndex = 0;
    for (let ratelimit of ratelimits) {
        if(ratelimit[0] === 1) {
            // rate limited
            minIndex = currentIndex;
            break;
        }
        if(!minValue) {
            // first loop
            minValue = ratelimit[2];
        } else if(ratelimit[2] < minValue) {
            // smaller remaining
            minIndex = currentIndex;
        }

        currentIndex++;
    }

    return ratelimits[minIndex];
}

function isRateLimitEnabledByEndpoint(endpointGroup) {
    return global.environment.enabledFeatures.rateLimitsByEndpoint[endpointGroup] === true;
}

module.exports.rateLimitMiddleware = rateLimitMiddleware;
module.exports.RATE_LIMIT_ENDPOINTS_GROUPS = RATE_LIMIT_ENDPOINTS_GROUPS;
module.exports.getStoreKey = getStoreKey;
