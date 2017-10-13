module.exports = function rateLimitMiddleware (metadataBackend) {
    return function rateLimit(req, res, next) {
        console.log('rateLimitMiddleware');

        const DB = 5;

        const user = 'cdb';
        const redisParams = [
            user,
            15,
            30,
            60
        ];
                    
        metadataBackend.redisCmd(DB, 'CL.THROTTLE', redisParams, function (err, result) {
            console.log('error', err);
            console.log('ok', result);
            
            if (err) {
                return next(err);
            }
            
            // if (!ok) {
            //     const err = new Error('You are over the limits, blah, blah');
            //     err.http_status = 429;
            //     return next(err)
            // }

            next();
        });
    };
};