'use strict';

var NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
var templateName = require('../backends/template_maps').templateName;

var LruCache = require("lru-cache");

const TEN_MINUTES_IN_MILLISECONDS = 1000 * 60 * 10;
const ACTIONS = ['update', 'delete'];

function NamedMapProviderCache(
    templateMaps,
    pgConnection,
    metadataBackend,
    userLimitsBackend,
    mapConfigAdapter,
    affectedTablesCache
) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
    this.userLimitsBackend = userLimitsBackend;
    this.mapConfigAdapter = mapConfigAdapter;
    this.affectedTablesCache = affectedTablesCache;

    this.providerCache = new LruCache({ max: 2000, maxAge: TEN_MINUTES_IN_MILLISECONDS });

    ACTIONS.forEach(action => templateMaps.on(action, (...args) => this.invalidate(...args)));
}

module.exports = NamedMapProviderCache;

NamedMapProviderCache.prototype.get = function(user, templateId, config, authToken, params, callback) {
    var namedMapKey = createNamedMapKey(user, templateId);
    var namedMapProviders = this.providerCache.get(namedMapKey) || {};
    var providerKey = createProviderKey(config, authToken, params);

    if (namedMapProviders.hasOwnProperty(providerKey)) {
        return callback(null, namedMapProviders[providerKey]);
    }

    namedMapProviders[providerKey] = new NamedMapMapConfigProvider(
        this.templateMaps,
        this.pgConnection,
        this.metadataBackend,
        this.userLimitsBackend,
        this.mapConfigAdapter,
        this.affectedTablesCache,
        user,
        templateId,
        config,
        authToken,
        params
    );

    this.providerCache.set(namedMapKey, namedMapProviders);

    return callback(null, namedMapProviders[providerKey]);
};

NamedMapProviderCache.prototype.invalidate = function(user, templateId) {
    this.providerCache.del(createNamedMapKey(user, templateId));
};

function createNamedMapKey(user, templateId) {
    return user + ':' + templateName(templateId);
}

var providerKeyTpl = ctx => `${ctx.authToken}:${ctx.configHash}:${ctx.format}:${ctx.layer}:${ctx.scale_factor}`;

function createProviderKey(config, authToken, params) {
    const defaults = {
        authToken: authToken || '',
        configHash: NamedMapMapConfigProvider.configHash(config),
        layer: '',
        format: '',
        scale_factor: 1
    };
    const ctx = Object.assign({}, defaults, params);

    return providerKeyTpl(ctx);
}
