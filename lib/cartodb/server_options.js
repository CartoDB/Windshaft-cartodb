'use strict';

const fqdn = require('@carto/fqdn-sync');
var _ = require('underscore');

var rendererConfig = _.defaults(global.environment.renderer || {}, {
    cache_ttl: 60000, // milliseconds
    statsInterval: 60000,
    mapnik: {
        poolSize: 8,
        poolMaxWaitingClients: 64,
        metatile: 2,
        bufferSize: 64,
        snapToGrid: false,
        clipByBox2d: false,
        metrics: false,
        postgis: {
            simplify_geometries: false,
            extent: '-20037508.3,-20037508.3,20037508.3,20037508.3',
            row_limit: 65535,
            persist_connection: false,
            max_size: 500,
            twkb_encoding: true
        },
        limits: {}
    },
    http: {},
    mvt: {}
});

// Perform keyword substitution in statsd
// See https://github.com/CartoDB/Windshaft-cartodb/issues/153
if (global.environment.statsd) {
    if (global.environment.statsd.prefix) {
        global.environment.statsd.prefix = global.environment.statsd.prefix.replace(/:host/, fqdn.reverse());
    }
}

var analysisConfig = _.defaults(global.environment.analysis || {}, {
    batch: {
        inlineExecution: false,
        endpoint: 'http://127.0.0.1:8080/api/v2/sql/job',
        hostHeaderTemplate: '{{=it.username}}.localhost.lan'
    },
    logger: {
        filename: undefined
    },
    limits: {}
});

module.exports = {
    bind: {
        port: global.environment.port,
        host: global.environment.host
    },
    // FIXME: Remove it. This is no longer needed, paths are defined in routers
    // This is for inline maps and table maps
    base_url: global.environment.base_url_legacy || '/tiles/:table',

    /// @deprecated with Windshaft-0.17.0
    ///base_url_notable: '/tiles',

    // FIXME: Remove it. This is no longer needed, paths are defined in routers
    // This is for Detached maps
    //
    // "maps" is the official, while
    // "tiles/layergroup" is for backward compatibility up to 1.6.x
    //
    base_url_mapconfig: global.environment.base_url_detached || '(?:/maps|/tiles/layergroup)',

    // FIXME: Remove it. This is no longer needed, paths are defined in routers
    base_url_templated: global.environment.base_url_templated || '(?:/maps/named|/tiles/template)',

    // Base URLs for the APIs
    //
    // See http://github.com/CartoDB/Windshaft-cartodb/wiki/Unified-Map-API
    routes: global.environment.routes || {
        v1: {
            paths: [
                '/api/v1',
                '/user/:user/api/v1',
            ],
            // Base url for the Detached Maps API
            // "/api/v1/map" is the new API,
            map: {
                paths: [
                    '/map',
                ]
            },
            // Base url for the Templated Maps API
            // "/api/v1/map/named" is the new API,
            template: {
                paths: [
                    '/map/named'
                ]
            }
        },
        // For compatibility with versions up to 1.6.x
        v0: {
            paths: [
                '/tiles'
            ],
            // Base url for the Detached Maps API
            // "/tiles/layergroup" is for compatibility with versions up to 1.6.x
            map: {
                paths: [
                    '/layergroup'
                ]
            },
            // Base url for the Templated Maps API
            // "/tiles/template" is for compatibility with versions up to 1.6.x
            template: {
                paths: [
                    '/template'
                ]
            }
        }
    },

    grainstore: {
        map: {
            // TODO: allow to specify in configuration
            srid: 3857
        },
        datasource: rendererConfig.mapnik.postgis || global.environment.postgres || {},
        cachedir: global.environment.millstone.cache_basedir,
        use_workers: rendererConfig.mapnik.useCartocssWorkers || false,
        mapnik_version: global.environment.mapnik_version,
        mapnik_tile_format: global.environment.mapnik_tile_format || 'png',
        default_layergroup_ttl: global.environment.mapConfigTTL || 7200
    },
    statsd: global.environment.statsd,
    renderCache: {
        ttl: rendererConfig.cache_ttl,
        statsInterval: rendererConfig.statsInterval
    },
    renderer: {
        mvt: Object.assign({ dbPoolParams: global.environment.postgres.pool }, rendererConfig.mvt),
        mapnik: rendererConfig.mapnik,
        torque: Object.assign({ dbPoolParams: global.environment.postgres.pool }, rendererConfig.torque),
        http: rendererConfig.http
    },

    analysis: {
        batch: {
            inlineExecution: analysisConfig.batch.inlineExecution,
            endpoint: analysisConfig.batch.endpoint,
            hostHeaderTemplate: analysisConfig.batch.hostHeaderTemplate
        },
        logger: {
            filename: analysisConfig.logger.filename
        },
        limits: analysisConfig.limits
    },
    // Do not send unwatch on release. See http://github.com/CartoDB/Windshaft-cartodb/issues/161
    redis: _.extend(global.environment.redis, {unwatchOnRelease: false}),
    enable_cors: global.environment.enable_cors,
    varnish_host: global.environment.varnish.host,
    varnish_port: global.environment.varnish.port,
    varnish_http_port: global.environment.varnish.http_port,
    varnish_secret: global.environment.varnish.secret,
    varnish_purge_enabled: global.environment.varnish.purge_enabled,
    fastly: global.environment.fastly || {},
    cache_enabled: global.environment.cache_enabled,
    log_format: global.environment.log_format,
    useProfiler: global.environment.useProfiler,
    aggregation: global.environment.aggregation || {
        enabled: true,
        threshold: {
            raster: 5e5, // 500K
            vector: 1e5 // 100K
        }
    }
};
