const MapStoreMapConfigProvider = require('../../../models/mapconfig/provider/map-store-provider');

module.exports = function createMapStoreMapConfigProvider (
    mapStore,
    userLimitsApi,
    pgConnection,
    affectedTablesCache,
    forcedFormat = null
) {
    return function createMapStoreMapConfigProviderMiddleware (req, res, next) {
        const { user, token, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { layer, z, x, y, scale_factor, format } = req.params;

        const params = {
            user, token, cache_buster, api_key,
            dbuser, dbname, dbpassword, dbhost, dbport,
            layer, z, x, y, scale_factor, format
        };

        if (forcedFormat) {
            params.format = forcedFormat;
            params.layer = params.layer || 'all';
        }

        res.locals.mapConfigProvider = new MapStoreMapConfigProvider(
            mapStore,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            params
        );

        next();
    };
};
