'use strict';

const fqdn = require('@carto/fqdn-sync');
var _ = require('underscore');
var OverviewsQueryRewriter = require('./utils/overviews-query-rewriter');

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
            use_overviews: true,
            max_size: 500,
            twkb_encoding: true
        },
        limits: {}
    },
    http: {},
    mvt: {}
});

rendererConfig.mapnik.queryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'cartodb.CDB_ZoomFromScale(!scale_denominator!)'
});

rendererConfig.mvt.queryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'cartodb.CDB_ZoomFromScale(!scale_denominator!)'
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
    // Base URLs for the APIs
    //
    // See http://github.com/CartoDB/Windshaft-cartodb/wiki/Unified-Map-API
    routes: global.environment.routes || {
        api: [{
            paths: [
                '/api/v1',
                '/user/:user/api/v1'
            ],
            // Base url for the Detached Maps API
            // "/api/v1/map" is the new API,
            map: [{
                paths: [
                    '/map'
                ]
            }],
            // Base url for the Templated Maps API
            // "/api/v1/map/named" is the new API,
            template: [{
                paths: [
                    '/map/named'
                ]
            }]
        }]
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
        ttl: rendererConfig.cache_ttl || 60000,
        statsInterval: rendererConfig.statsInterval || 60000
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
    redis: _.extend(global.environment.redis, { unwatchOnRelease: false }),
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
    pubSubMetrics: Object.assign({ enabled: false }, global.environment.pubSubMetrics)
};
