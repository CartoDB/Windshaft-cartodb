'use strict';

const LruCache = require('lru-cache');

const NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
const { templateName } = require('../backends/template-maps');

const TEN_MINUTES_IN_MILLISECONDS = 1000 * 60 * 10;
const ACTIONS = ['update', 'delete'];

module.exports = class NamedMapProviderCache {
    constructor (
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

        ACTIONS.forEach(action => templateMaps.on(action, (user, templateId) => this.invalidate(user, templateId)));
    }

    get (user, templateId, config, authToken, params, callback) {
        const namedMapKey = createNamedMapKey(user, templateId);
        const namedMapProviders = this.providerCache.get(namedMapKey) || {};
        const providerKey = createProviderKey(config, authToken, params);

        if (Object.prototype.hasOwnProperty.call(namedMapProviders, providerKey)) {
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
    }

    invalidate (user, templateId) {
        this.providerCache.del(createNamedMapKey(user, templateId));
    }
};

function createNamedMapKey (user, templateId) {
    return `${user}:${templateName(templateId)}`;
}

const providerKeyTpl = ctx => `${ctx.authToken}:${ctx.configHash}:${ctx.format}:${ctx.layer}:${ctx.scale_factor}`;

function createProviderKey (config, authToken, params) {
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
