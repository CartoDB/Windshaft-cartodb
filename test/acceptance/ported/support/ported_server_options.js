var _ = require('underscore');
var serverOptions = require('../../../../lib/cartodb/server_options');
var LayergroupToken = require('../../../support/layergroup-token');
var mapnik = require('windshaft').mapnik;
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
    afterLayergroupCreateCalls: 0,
    useProfiler: true,
    req2params: function(req, callback){

        if ( req.query.testUnexpectedError ) {
            return callback('test unexpected error');
        }

        // this is in case you want to test sql parameters eg ...png?sql=select * from my_table limit 10
        req.params =  _.extend({}, req.params);
        if (req.params.token) {
            req.params.token = LayergroupToken.parse(req.params.token).token;
        }

        _.extend(req.params, req.query);
        req.params.user = 'localhost';
        req.context = {user: 'localhost'};

        req.params.dbhost = global.environment.postgres.host;
        req.params.dbport = req.params.dbport || global.environment.postgres.port;

        req.params.dbuser = 'test_windshaft_publicuser';
        if (req.params.dbname !== 'windshaft_test2') {
            req.params.dbuser = 'test_windshaft_cartodb_user_1';
        }
        req.params.dbname = 'test_windshaft_cartodb_user_1_db';


        // increment number of calls counter
        global.req2params_calls = global.req2params_calls ? global.req2params_calls + 1 : 1;

        // send the finished req object on
        callback(null,req);
    },
    afterLayergroupCreate: function(req, cfg, res, callback) {
        res.layercount = cfg.layers.length;
//        config.afterLayergroupCreateCalls++;
        callback(null);
    }

});
