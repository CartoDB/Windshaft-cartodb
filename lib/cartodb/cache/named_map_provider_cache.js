var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');

function NamedMapProviderCache(templateMaps, pgConnection, userLimitsApi, queryTablesApi) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;
}

module.exports = NamedMapProviderCache;

NamedMapProviderCache.prototype.get = function(user, templateId, config, authToken, params) {
    return new NamedMapMapConfigProvider(
        this.templateMaps,
        this.pgConnection,
        this.userLimitsApi,
        this.queryTablesApi,
        user,
        templateId,
        config,
        authToken,
        params
    );
};
