module.exports = function parseTokenParamMiddleware () {
    return function parseTokenParam (req, res, next) {
        // jshint maxcomplexity:7
        if (!req.params.token) {
            return next();
        }

        var user = req.context.user;

        // Token might match the following patterns:
        // - {user}@{tpl_id}@{token}:{cache_buster}
        var tksplit = req.params.token.split(':');

        req.params.token = tksplit[0];

        if ( tksplit.length > 1 ) {
            req.params.cache_buster= tksplit[1];
        }

        tksplit = req.params.token.split('@');

        if ( tksplit.length > 1 ) {
            req.params.signer = tksplit.shift();

            if ( ! req.params.signer ) {
                req.params.signer = user;
            } else if ( req.params.signer !== user ) {
                var err = new Error(
                    `Cannot use map signature of user "${req.params.signer}" on db of user "${user}"`
                );
                err.http_status = 403;
                req.profiler.done('req2params');

                return next(err);
            }

            // skip template hash
            if (tksplit.length > 1) {
                tksplit.shift();
            }

            req.params.token = tksplit.shift();
        }

        next();
    };
};
