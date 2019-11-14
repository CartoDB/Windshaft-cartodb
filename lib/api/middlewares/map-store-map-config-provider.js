'use strict';

const MapStoreMapConfigProvider = require('../../models/mapconfig/provider/map-store-provider');

module.exports = function createMapStoreMapConfigProvider (
    mapStore,
    userLimitsBackend,
    pgConnection,
    affectedTablesCache,
    forcedFormat = null
) {
    return function createMapStoreMapConfigProviderMiddleware (req, res, next) {
        const { user, token, cache_buster: cacheBuster, api_key: apiKey } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { layer: layerFromParams, z, x, y, scale_factor: scaleFactor, format } = req.params;
        const { layer: layerFromQuery } = req.query;

        const params = {
            user,
            token,
            cache_buster: cacheBuster,
            api_key: apiKey,
            dbuser,
            dbname,
            dbpassword,
            dbhost,
            dbport,
            layer: (layerFromQuery || layerFromParams),
            z,
            x,
            y,
            scale_factor: scaleFactor,
            format
        };

        if (forcedFormat) {
            params.format = forcedFormat;
            params.layer = params.layer || 'all';
        }

        res.locals.mapConfigProvider = new MapStoreMapConfigProvider(
            mapStore,
            user,
            userLimitsBackend,
            pgConnection,
            affectedTablesCache,
            params
        );

        next();
    };
};
