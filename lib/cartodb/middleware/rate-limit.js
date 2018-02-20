'use strict';

const REDIS_DB = 8;

const RATE_LIMIT_ENDPOINTS_GROUPS = {
    ENDPOINT_1: 'anonymous',
    ENDPOINT_2: 'static',
    ENDPOINT_3: 'static-named',
    ENDPOINT_5: 'dataview',
    ENDPOINT_6: 'dataview-search',
    ENDPOINT_7: 'analysis',
    ENDPOINT_8: 'tile',
    ENDPOINT_9: 'attributes',
    ENDPOINT_10: 'named-list',
    ENDPOINT_11: 'named-create',
    ENDPOINT_12: 'named-get',
    ENDPOINT_13: 'named',
    ENDPOINT_14: 'named-update',
    ENDPOINT_15: 'named-delete',
    ENDPOINT_17: 'named-tiles'
};

function rateLimitMiddleware(metadataBackend, endpointGroup = null) {
    return function rateLimit(req, res, next) {

        const user = 'cdb';
        // const user = res.locals.user;
        if (!endpointGroup) {
            endpointGroup = getEndpointGroup();
        }

        const redisParams = [
            getLuaScript(),
            2,
            getStoreKey(user, endpointGroup),   // KEY[1] 
            getStatusKey(user, endpointGroup)   // KEY[2]
        ];

        metadataBackend.redisCmd(REDIS_DB, 'EVAL', redisParams, function(err, data) {
            if (err) {
                return next(err);
            }

            if (!data || !Array.isArray(data)) {
                return next();
            }

            const isBloqued = data[0]; 
            const limit = data[1];
            const remaining = data[2];
            const retry = data[3];
            const reset = data[4];

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
    return `rate-limit:store:${user}:${endpointGroup}`;
}

/**
 * Returns Redis key where the current state of the limit by user and endpoint 
 * This key is managed by redis-cell (CL.THROTTLE command)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStatusKey(user, endpointGroup) {
    return `rate-limit:status:${user}:${endpointGroup}`;
}

function getLuaScript() {
    return `
        local limmits = {}
        local limmitsArray = redis.call("HGETALL", KEYS[1])
        if table.getn(limmitsArray) == 6 then
            limmits[limmitsArray[1]] = limmitsArray[2]
            limmits[limmitsArray[3]] = limmitsArray[4]
            limmits[limmitsArray[5]] = limmitsArray[6]
    
            return redis.call("CL.THROTTLE", KEYS[2], limmits['b'], limmits['c'], limmits['p']) 
        else
            return nil 
        end
    `;
}

module.exports.rateLimitMiddleware = rateLimitMiddleware;
module.exports.RATE_LIMIT_ENDPOINTS_GROUPS = RATE_LIMIT_ENDPOINTS_GROUPS;
module.exports.getStoreKey = getStoreKey;
