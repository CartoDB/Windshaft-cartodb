var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');
var templateName = require('../backends/template_maps').templateName;

var LruCache = require("lru-cache");

function NamedMapProviderCache(templateMaps, pgConnection, userLimitsApi, queryTablesApi) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;

    this.providerCache = new LruCache({ max: 2000 });
}

module.exports = NamedMapProviderCache;

NamedMapProviderCache.prototype.get = function(user, templateId, config, authToken, params) {
    var namedMapKey = createNamedMapKey(user, templateId);
    var namedMapProviders = this.providerCache.get(namedMapKey) || {};

    var providerKey = createProviderKey(config, authToken);
    if (!namedMapProviders.hasOwnProperty(providerKey)) {
        namedMapProviders[providerKey] = new NamedMapMapConfigProvider(
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
        this.providerCache.set(namedMapKey, namedMapProviders);
    }

    return namedMapProviders[providerKey];
};

NamedMapProviderCache.prototype.invalidate = function(user, templateId) {
    this.providerCache.del(createNamedMapKey(user, templateId));
};

function createNamedMapKey(user, templateId) {
    return user + ':' + templateName(templateId);
}

function createProviderKey(config, authToken) {
    return NamedMapMapConfigProvider.configHash(config) + ':' + authToken;
}
