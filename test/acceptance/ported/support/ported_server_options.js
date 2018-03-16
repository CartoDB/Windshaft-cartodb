var _ = require('underscore');
var serverOptions = require('../../../../lib/cartodb/server_options');
var mapnik = require('windshaft').mapnik;
var LayergroupToken = require('../../../../lib/cartodb/models/layergroup-token');
var OverviewsQueryRewriter = require('../../../../lib/cartodb/utils/overviews_query_rewriter');
var overviewsQueryRewriter = new OverviewsQueryRewriter({
  zoom_level: 'CDB_ZoomFromScale(!scale_denominator!)'
});

module.exports = _.extend({}, serverOptions, {
    base_url: '/database/:dbname/table/:table',
    base_url_mapconfig: '/database/:dbname/layergroup',
    grainstore: {
        datasource: {
            geometry_field: 'the_geom',
            srid: 4326
        },
        cachedir: global.environment.millstone.cache_basedir,
        mapnik_version: global.environment.mapnik_version || mapnik.versions.mapnik,
        gc_prob: 0 // run the garbage collector at each invocation
    },
    renderer: {
        mapnik: {
            poolSize: 4,//require('os').cpus().length,
            metatile: 1,
            bufferSize: 64,
            snapToGrid: false,
            clipByBox2d: false, // this requires postgis >=2.2 and geos >=3.5
            scale_factors: [1, 2],
            metrics: false,
            limits: {
                render: 0,
                cacheOnTimeout: true
            },
            queryRewriter: overviewsQueryRewriter
        },
        http: {
            timeout: 5000,
            whitelist: ['http://127.0.0.1:8033/{s}/{z}/{x}/{y}.png'],
            fallbackImage: {
                type: 'fs',
                src: __dirname + '/../../test/fixtures/http/basemap.png'
            }
        }
    },
    redis: global.environment.redis,
    enable_cors: global.environment.enable_cors,
    unbuffered_logging: true, // for smoother teardown from tests
    log_format: null, // do not log anything
    useProfiler: true,
});
