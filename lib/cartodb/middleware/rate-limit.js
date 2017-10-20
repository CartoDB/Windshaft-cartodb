'use strict';

module.exports = function rateLimitMiddleware (metadataBackend) {
    return function rateLimit(req, res, next) {
        console.log('rateLimitMiddleware');
        
        // get user
        const user = 'cdb'; // TODO: remove this line
        // const user = res.locals.user;
        // if(!user) {
        //     return next();
        // }


        // get endpoint
        // TODO


        const DB = 5;
        let maxBurst 
        let countPerPeriod
        let period

        // get the limits by user account type and endpoint
        metadataBackend.redisCmd(DB, 'get', ['RateLimitsKey'], function(err, response) {
            if (err) {
                return next(err);
            }

            // maxBurst
            // countPerPeriod
            // period

            const rateLimitParams = [
                user,
                maxBurst - 1,
                countPerPeriod,
                period
            ];
        
            metadataBackend.redisCmd(
                DB, 
                'CL.THROTTLE', 
                rateLimitParams, 
                function (err, {isBloqued, limit, remaining, retry, reset}) {
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
                }
            );
        })
    };
};