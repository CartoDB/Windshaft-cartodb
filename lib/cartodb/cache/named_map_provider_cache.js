var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');
var templateName = require('../backends/template_maps').templateName;

function NamedMapProviderCache(templateMaps, pgConnection, userLimitsApi, queryTablesApi) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;

    this.providerCache = {};
}

module.exports = NamedMapProviderCache;

NamedMapProviderCache.prototype.get = function(user, templateId, config, authToken, params) {
    var namedMapKey = createNamedMapKey(user, templateId);
    if (!this.providerCache.hasOwnProperty(namedMapKey)) {
        this.providerCache[namedMapKey] = {};
    }

    var providerKey = createProviderKey(config, authToken);
    if (!this.providerCache[namedMapKey].hasOwnProperty(providerKey)) {
        this.providerCache[namedMapKey][providerKey] = new NamedMapMapConfigProvider(
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
    }

    return this.providerCache[namedMapKey][providerKey];
};

NamedMapProviderCache.prototype.invalidate = function(user, templateId) {
    delete this.providerCache[createNamedMapKey(user, templateId)];
};

function createNamedMapKey(user, templateId) {
    return user + ':' + templateName(templateId);
}

function createProviderKey(config, authToken) {
    return NamedMapMapConfigProvider.configHash(config) + ':' + authToken;
}
