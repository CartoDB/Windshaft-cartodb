'use strict';

module.exports = function getNamedMapProvider ({ namedMapProviderCache, label, forcedFormat = null }) {
    return function getNamedMapProviderMiddleware (req, res, next) {
        const { user, token, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { template_id, layer: layerFromParams, z, x, y, format } = req.params;
        const { layer: layerFromQuery } = req.query;

        const params = {
            user,
            token,
            cache_buster,
            api_key,
            dbuser,
            dbname,
            dbpassword,
            dbhost,
            dbport,
            template_id,
            layer: (layerFromQuery || layerFromParams),
            z,
            x,
            y,
            format
        };

        if (forcedFormat) {
            params.format = forcedFormat;
            params.layer = params.layer || 'all';
        }

        const { config, auth_token } = req.query;

        namedMapProviderCache.get(user, template_id, config, auth_token, params, (err, namedMapProvider) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.mapConfigProvider = namedMapProvider;

            next();
        });
    };
};
