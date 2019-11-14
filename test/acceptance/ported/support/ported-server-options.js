'use strict';

var _ = require('underscore');
var serverOptions = require('../../../../lib/server-options');
var mapnik = require('windshaft').mapnik;
var OverviewsQueryRewriter = require('../../../../lib/utils/overviews-query-rewriter');
var overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'CDB_ZoomFromScale(!scale_denominator!)'
});
var path = require('path');

module.exports = _.extend({}, serverOptions, {
    grainstore: {
        datasource: {
            geometry_field: 'the_geom',
            srid: 4326
        },
        cachedir: global.environment.millstone.cache_basedir,
        mapnik_version: global.environment.mapnik_version || mapnik.versions.mapnik,
        gc_prob: 0, // run the garbage collector at each invocation
        default_layergroup_ttl: global.environment.mapConfigTTL || 7200
    },
    renderer: {
        mapnik: {
            poolSize: 4, // require('os').cpus().length,
            poolMaxWaitingClients: 32,
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
                src: path.join(__dirname, '/../../test/fixtures/http/basemap.png')
            }
        }
    },
    redis: global.environment.redis,
    enable_cors: global.environment.enable_cors,
    unbuffered_logging: true, // for smoother teardown from tests
    log_format: null, // do not log anything
    useProfiler: true
});
