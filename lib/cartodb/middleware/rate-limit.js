'use strict';

const REDIS_DB = 8;

const ENDPOINTS_GROUPS_REDIS = {
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
    ENDPOINT_16: 'named-options',
    ENDPOINT_17: 'named-tiles'
};

/**
 * The full key is: rate-limit:store:{user}:{endpoint}
 * The value is a Redis hash:
 *      maxBurst (b): Integer (as string)
 *      countPerPeriod (c): Integer (as string)
 *      period (p): Integer (as string)
 */
const ENDPOINT_KEY_REDIS = 'rate-limit:store:';

/**
 * The full key is: rate-limit:status:{user}:{endpoint}
 * This key is managed by redis-cell (CL.THROTTLE command)
 */
const USER_KEY_REDIS = 'rate-limit:status:';


module.exports = function rateLimitMiddleware(metadataBackend) {
    return function rateLimit(req, res, next) {

        const user = 'cdb';
        // const user = res.locals.user;
        const endpointGroup = getEndpointGroup();

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
};


/**
 * Returns the endpoint key in Redis
 * @param {string} currentEndpoint 
 */
function getEndpointGroup(currentEndpoint = null) {
    // TODO
    if (currentEndpoint) {
        return ENDPOINTS_GROUPS_REDIS.ENDPOINT_8;
    } else {
        // get endpoint from route path
        return ENDPOINTS_GROUPS_REDIS.ENDPOINT_8;
    }
}

/**
 * Returns Redis key where the limits are saved by user and endpoint
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStoreKey(user, endpointGroup) {
    return ENDPOINT_KEY_REDIS + user + ':' + endpointGroup;
}

/**
 * Returns Redis key where the current state of the limit by user and endpoint 
 * (so, the key where CL.THROTTLE works)
 * @param {string} user 
 * @param {string} endpointGroup 
 */
function getStatusKey(user, endpointGroup) {
    return USER_KEY_REDIS + user + ':' + endpointGroup;
}

function getLuaScript() {
    return `
        local limmits = {}
        local limmitsArray = redis.call("HGETALL", KEYS[1])
        if table.getn(limmitsArray) == 4 then
            limmits[limmitsArray[1]] = limmitsArray[2]
            limmits[limmitsArray[3]] = limmitsArray[4]
            limmits[limmitsArray[5]] = limmitsArray[6]
    
            return redis.call("CL.THROTTLE", KEYS[2], limmits['b'], limmits['c'], limmits['p']) 
        else
            return nil 
        end
    `;
}
