'use strict';

var _ = require('underscore');
var dot = require('dot');
var NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
var templateName = require('../backends/template_maps').templateName;
var queue = require('queue-async');

var LruCache = require("lru-cache");

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

    this.providerCache = new LruCache({ max: 2000 });
}

module.exports = NamedMapProviderCache;

NamedMapProviderCache.prototype.get = function(user, templateId, config, authToken, params, callback) {
    var namedMapKey = createNamedMapKey(user, templateId);
    var namedMapProviders = this.providerCache.get(namedMapKey) || {};

    var providerKey = createProviderKey(config, authToken, params);
    if (!namedMapProviders.hasOwnProperty(providerKey)) {
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

        // early exit, if provider did not exist we just return it
        return callback(null, namedMapProviders[providerKey]);
    }

    var namedMapProvider = namedMapProviders[providerKey];

    var self = this;
    queue(2)
        .defer(namedMapProvider.getTemplate.bind(namedMapProvider))
        .defer(this.templateMaps.getTemplate.bind(this.templateMaps), user, templateId)
        .awaitAll(function templatesQueueDone(err, results) {
            if (err) {
                return callback(err);
            }

            // We want to reset provider its template has changed
            // Ideally this should be done in a passive mode where this cache gets notified of template changes
            var uniqueFingerprints = _.uniq(results.map(self.templateMaps.fingerPrint)).length;
            if (uniqueFingerprints > 1) {
                namedMapProvider.reset();
            }
            return callback(null, namedMapProvider);
        });
};

NamedMapProviderCache.prototype.invalidate = function(user, templateId) {
    this.providerCache.del(createNamedMapKey(user, templateId));
};

function createNamedMapKey(user, templateId) {
    return user + ':' + templateName(templateId);
}

var providerKey = '{{=it.authToken}}:{{=it.configHash}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';
var providerKeyTpl = dot.template(providerKey);

function createProviderKey(config, authToken, params) {
    var tplValues = _.defaults({}, params, {
        authToken: authToken || '',
        configHash: NamedMapMapConfigProvider.configHash(config),
        layer: '',
        format: '',
        scale_factor: 1
    });
    return providerKeyTpl(tplValues);
}
