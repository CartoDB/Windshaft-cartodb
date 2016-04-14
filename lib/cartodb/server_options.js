var os = require('os');
var _ = require('underscore');
var OverviewsQueryRewriter = require('./utils/overviews_query_rewriter');

var overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'CDB_ZoomFromScale(!scale_denominator!)'
});

var rendererConfig = _.defaults(global.environment.renderer || {}, {
    cache_ttl: 60000, // milliseconds
    statsInterval: 60000,
    mapnik: {
        poolSize: 8,
        metatile: 2,
        bufferSize: 64,
        snapToGrid: false,
        clipByBox2d: false,
        limits: {}
    },
    http: {}
});

rendererConfig.mapnik.queryRewriter = overviewsQueryRewriter;

// Perform keyword substitution in statsd
// See https://github.com/CartoDB/Windshaft-cartodb/issues/153
if (global.environment.statsd) {
    if (global.environment.statsd.prefix) {
        var host_token = os.hostname().split('.').reverse().join('.');
        global.environment.statsd.prefix = global.environment.statsd.prefix.replace(/:host/, host_token);
    }
}

var analysisConfig = _.defaults(global.environment.analysis || {}, {
    batch: {
        endpoint: 'http://127.0.0.1:8080/api/v1/sql/job'
    }
});

module.exports = {
    bind: {
        port: global.environment.port,
        host: global.environment.host
    },
    // This is for inline maps and table maps
    base_url: global.environment.base_url_legacy || '/tiles/:table',

    /// @deprecated with Windshaft-0.17.0
    ///base_url_notable: '/tiles',

    // This is for Detached maps
    //
    // "maps" is the official, while
    // "tiles/layergroup" is for backward compatibility up to 1.6.x
    //
    base_url_mapconfig: global.environment.base_url_detached || '(?:/maps|/tiles/layergroup)',

    base_url_templated: global.environment.base_url_templated || '(?:/maps/named|/tiles/template)',

    grainstore: {
        map: {
            // TODO: allow to specify in configuration
            srid: 3857
        },
        datasource: global.environment.postgres,
        cachedir: global.environment.millstone.cache_basedir,
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
        mapnik: _.defaults(rendererConfig.mapnik, {
            geojson: {
                dbPoolParams: {
                    size: 16,
                    idleTimeout: 3000,
                    reapInterval: 1000
                },
                clipByBox2d: false
            }
        }),
        torque: rendererConfig.torque,
        http: rendererConfig.http
    },

    analysis: {
        batch: {
            endpoint: analysisConfig.batch.endpoint
        }
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
    useProfiler: global.environment.useProfiler
};
