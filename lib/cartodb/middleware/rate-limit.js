'use strict';

 function getLuaScript(maxBurst, period) {
    return  `
        local max = redis.call("GET", KEYS[1])
        return redis.call("CL.THROTTLE", KEYS[2], ${maxBurst}, max, ${period})
    `;
 }

module.exports = function rateLimitMiddleware (metadataBackend) {
    return function rateLimit(req, res, next) {
        
        // get user
        const user = 'cdb'; // TODO: remove this line
        // const user = res.locals.user;
        // if(!user) {
        //     return next();
        // }


        // get endpoint group
        // TODO


        const DB = 5;
        const redisParams = [
            getLuaScript(10, 60),
            3,
            user + ':rate-limit:store',     // KEY[1] key where the limit is saved by user and endpoint
            user + ':rate-limit:current'    // KEY[2] key wherev the current state of the limit by user and endpoint
        ];
        
        metadataBackend.redisCmd(DB, 'EVAL', redisParams, function(err, {isBloqued, limit, remaining, retry, reset}) {
            if (err) {
                return next(err);
            }
    
            res.set({
                'X-Rate-Limit-Limit': limit,
                'X-Rate-Limit-Remaining': remaining,
                'X-Rate-Limit-Retry-After': retry,
                'X-Rate-Limit-Reset': reset
            });

            if(isBloqued) {
                const err = new Error('You are over the limits.');
                err.http_status = 429;
                return next(err);
            }
            
            next();
        });
    };
};