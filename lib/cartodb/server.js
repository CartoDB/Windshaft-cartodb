var express = require('express');
var bodyParser = require('body-parser');
var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var _ = require('underscore');

var controller = require('./controllers');

var SurrogateKeysCache = require('./cache/surrogate_keys_cache');
var NamedMapsCacheEntry = require('./cache/model/named_maps_entry');
var VarnishHttpCacheBackend = require('./cache/backend/varnish_http');
var FastlyCacheBackend = require('./cache/backend/fastly');

var StatsClient = require('./stats/client');
var Profiler = require('./stats/profiler_proxy');
var RendererStatsReporter = require('./stats/reporter/renderer');

var windshaft = require('windshaft');
var mapnik = windshaft.mapnik;

var TemplateMaps = require('./backends/template_maps.js');
var OverviewsMetadataApi = require('./api/overviews_metadata_api');
var FilterStatsApi = require('./api/filter_stats_api');
var UserLimitsApi = require('./api/user_limits_api');
var AuthApi = require('./api/auth_api');
var LayergroupAffectedTablesCache = require('./cache/layergroup_affected_tables');
var NamedMapProviderCache = require('./cache/named_map_provider_cache');
var PgQueryRunner = require('./backends/pg_query_runner');
var PgConnection = require('./backends/pg_connection');

var AnalysisBackend = require('./backends/analysis');

var timeoutErrorTilePath = __dirname + '/../../assets/render-timeout-fallback.png';
var timeoutErrorTile = require('fs').readFileSync(timeoutErrorTilePath, {encoding: null});

var SqlWrapMapConfigAdapter = require('./models/mapconfig/adapter/sql-wrap-mapconfig-adapter');
var MapConfigNamedLayersAdapter = require('./models/mapconfig/adapter/mapconfig-named-layers-adapter');
var MapConfigBufferSizeAdapter = require('./models/mapconfig/adapter/mapconfig-buffer-size-adapter');
var AnalysisMapConfigAdapter = require('./models/mapconfig/adapter/analysis-mapconfig-adapter');
var MapConfigOverviewsAdapter = require('./models/mapconfig/adapter/mapconfig-overviews-adapter');
var TurboCartoAdapter = require('./models/mapconfig/adapter/turbo-carto-adapter');
var DataviewsWidgetsAdapter = require('./models/mapconfig/adapter/dataviews-widgets-adapter');
var MapConfigAdapter = require('./models/mapconfig/adapter');

var StatsBackend = require('./backends/stats');

const errorMiddleware = require('./middleware/error-middleware');

module.exports = function(serverOptions) {
    // Make stats client globally accessible
    global.statsClient = StatsClient.getInstance(serverOptions.statsd);

    var redisPool = new RedisPool(_.defaults(global.environment.redis, {
        name: 'windshaft-server',
        unwatchOnRelease: false,
        noReadyCheck: true
    }));

    redisPool.on('status', function(status) {
        var keyPrefix = 'windshaft.redis-pool.' + status.name + '.db' + status.db + '.';
        global.statsClient.gauge(keyPrefix + 'count', status.count);
        global.statsClient.gauge(keyPrefix + 'unused', status.unused);
        global.statsClient.gauge(keyPrefix + 'waiting', status.waiting);
    });

    var metadataBackend = cartodbRedis({pool: redisPool});
    var pgConnection = new PgConnection(metadataBackend);
    var pgQueryRunner = new PgQueryRunner(pgConnection);
    var overviewsMetadataApi = new OverviewsMetadataApi(pgQueryRunner);
    var filterStatsApi = new FilterStatsApi(pgQueryRunner);
    var userLimitsApi = new UserLimitsApi(metadataBackend, {
        limits: {
            cacheOnTimeout: serverOptions.renderer.mapnik.limits.cacheOnTimeout || false,
            render: serverOptions.renderer.mapnik.limits.render || 0
        }
    });

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    var surrogateKeysCache = new SurrogateKeysCache(surrogateKeysCacheBackends(serverOptions));

    function invalidateNamedMap (owner, templateName) {
        var startTime = Date.now();
        surrogateKeysCache.invalidate(new NamedMapsCacheEntry(owner, templateName), function(err) {
            var logMessage = JSON.stringify({
                username: owner,
                type: 'named_map_invalidation',
                elapsed: Date.now() - startTime,
                error: !!err ? JSON.stringify(err.message) : undefined
            });
            if (err) {
                global.logger.warn(logMessage);
            } else {
                global.logger.info(logMessage);
            }
        });
    }
    ['update', 'delete'].forEach(function(eventType) {
        templateMaps.on(eventType, invalidateNamedMap);
    });

    serverOptions.grainstore.mapnik_version = mapnikVersion(serverOptions);

    validateOptions(serverOptions);

    bootstrapFonts(serverOptions);

    // initialize express server
    var app = bootstrap(serverOptions);
    // Extend windshaft with all the elements of the options object
    _.extend(app, serverOptions);

    var mapStore  = new windshaft.storage.MapStore({
        pool: redisPool,
        expire_time: serverOptions.grainstore.default_layergroup_ttl
    });

    var onTileErrorStrategy;
    if (global.environment.enabledFeatures.onTileErrorStrategy !== false) {
        onTileErrorStrategy = function onTileErrorStrategy$TimeoutTile(err, tile, headers, stats, format, callback) {

            function isRenderTimeoutError (err) {
                return err.message === 'Render timed out';
            }

            function isDatasourceTimeoutError (err) {
                return err.message && err.message.match(/canceling statement due to statement timeout/i);
            }

            function isTimeoutError (err) {
                return isRenderTimeoutError(err) || isDatasourceTimeoutError(err);
            }

            function isRasterFormat (format) {
                return format === 'png' || format === 'jpg';
            }

            if (isTimeoutError(err) && isRasterFormat(format)) {
                return callback(null, timeoutErrorTile, {
                    'Content-Type': 'image/png',
                }, {});
            } else {
                return callback(err, tile, headers, stats);
            }
        };
    }

    var rendererFactory = new windshaft.renderer.Factory({
        onTileErrorStrategy: onTileErrorStrategy,
        mapnik: {
            redisPool: redisPool,
            grainstore: serverOptions.grainstore,
            mapnik: serverOptions.renderer.mapnik
        },
        http: serverOptions.renderer.http
    });

    // initialize render cache
    var rendererCacheOpts = _.defaults(serverOptions.renderCache || {}, {
        ttl: 60000, // 60 seconds TTL by default
        statsInterval: 60000 // reports stats every milliseconds defined here
    });
    var rendererCache = new windshaft.cache.RendererCache(rendererFactory, rendererCacheOpts);
    var rendererStatsReporter = new RendererStatsReporter(rendererCache, rendererCacheOpts.statsInterval);
    rendererStatsReporter.start();

    var attributesBackend = new windshaft.backend.Attributes();
    var previewBackend = new windshaft.backend.Preview(rendererCache);
    var tileBackend = new windshaft.backend.Tile(rendererCache);
    var mapValidatorBackend = new windshaft.backend.MapValidator(tileBackend, attributesBackend);
    var mapBackend = new windshaft.backend.Map(rendererCache, mapStore, mapValidatorBackend);

    var analysisBackend = new AnalysisBackend(metadataBackend, serverOptions.analysis);

    var statsBackend = new StatsBackend();

    var layergroupAffectedTablesCache = new LayergroupAffectedTablesCache();
    app.layergroupAffectedTablesCache = layergroupAffectedTablesCache;

    var mapConfigAdapter = new MapConfigAdapter(
        new MapConfigNamedLayersAdapter(templateMaps, pgConnection),
        new MapConfigBufferSizeAdapter(),
        new SqlWrapMapConfigAdapter(),
        new DataviewsWidgetsAdapter(),
        new AnalysisMapConfigAdapter(analysisBackend),
        new MapConfigOverviewsAdapter(overviewsMetadataApi, filterStatsApi),
        new TurboCartoAdapter()
    );

    var namedMapProviderCache = new NamedMapProviderCache(
        templateMaps,
        pgConnection,
        metadataBackend,
        userLimitsApi,
        mapConfigAdapter
    );

    ['update', 'delete'].forEach(function(eventType) {
        templateMaps.on(eventType, namedMapProviderCache.invalidate.bind(namedMapProviderCache));
    });

    var authApi = new AuthApi(pgConnection, metadataBackend, mapStore, templateMaps);

    var TablesExtentApi = require('./api/tables_extent_api');
    var tablesExtentApi = new TablesExtentApi(pgQueryRunner);

    var versions = getAndValidateVersions(serverOptions);

    /*******************************************************************************************************************
     * Routing
     ******************************************************************************************************************/

    new controller.Layergroup(
        authApi,
        pgConnection,
        mapStore,
        tileBackend,
        previewBackend,
        attributesBackend,
        surrogateKeysCache,
        userLimitsApi,
        layergroupAffectedTablesCache,
        analysisBackend
    ).register(app);

    new controller.Map(
        authApi,
        pgConnection,
        templateMaps,
        mapBackend,
        metadataBackend,
        surrogateKeysCache,
        userLimitsApi,
        layergroupAffectedTablesCache,
        mapConfigAdapter,
        statsBackend
    ).register(app);

    new controller.NamedMaps(
        authApi,
        pgConnection,
        namedMapProviderCache,
        tileBackend,
        previewBackend,
        surrogateKeysCache,
        tablesExtentApi,
        metadataBackend
    ).register(app);

    new controller.NamedMapsAdmin(authApi, pgConnection, templateMaps).register(app);

    new controller.Analyses(authApi, pgConnection).register(app);

    new controller.ServerInfo(versions).register(app);

    /*******************************************************************************************************************
     * END Routing
     ******************************************************************************************************************/

    app.use(errorMiddleware());

    return app;
};

function validateOptions(opts) {
    if (!_.isString(opts.base_url) || !_.isString(opts.base_url_mapconfig) || !_.isString(opts.base_url_templated)) {
        throw new Error("Must initialise server with: 'base_url'/'base_url_mapconfig'/'base_url_templated' URLs");
    }
}

function getAndValidateVersions(options) {
    // jshint undef:false
    var warn = console.warn.bind(console);
    // jshint undef:true

    var packageDefinition = require('../../package.json');

    var declaredDependencies = packageDefinition.dependencies || {};
    var installedDependenciesVersions = {
        camshaft: require('camshaft').version,
        grainstore: windshaft.grainstore.version(),
        mapnik: windshaft.mapnik.versions.mapnik,
        node_mapnik: windshaft.mapnik.version,
        'turbo-carto': require('turbo-carto').version,
        windshaft: windshaft.version,
        windshaft_cartodb: packageDefinition.version
    };

    var dependenciesToValidate = ['camshaft', 'turbo-carto', 'windshaft'];
    dependenciesToValidate.forEach(function(depName) {
        var declaredDependencyVersion = declaredDependencies[depName];
        var installedDependencyVersion = installedDependenciesVersions[depName];
        if (declaredDependencyVersion !== installedDependencyVersion) {
            warn(
                'Dependency="%s" installed version="%s" does not match declared version="%s". Check your installation.',
                depName, installedDependencyVersion, declaredDependencyVersion
            );
        }
    });

    // Be nice and warn if configured mapnik version is != installed mapnik version
    if (mapnik.versions.mapnik !== options.grainstore.mapnik_version) {
        warn('WARNING: detected mapnik version (' + mapnik.versions.mapnik + ')' +
            ' != configured mapnik version (' + options.grainstore.mapnik_version + ')');
    }

    return installedDependenciesVersions;
}

function bootstrapFonts(opts) {
    // Set carto renderer configuration for MMLStore
    opts.grainstore.carto_env = opts.grainstore.carto_env || {};
    var cenv = opts.grainstore.carto_env;
    cenv.validation_data = cenv.validation_data || {};
    if ( ! cenv.validation_data.fonts ) {
        mapnik.register_system_fonts();
        mapnik.register_default_fonts();
        cenv.validation_data.fonts = _.keys(mapnik.fontFiles());
    }
}

function bootstrap(opts) {
    var app;
    if (_.isObject(opts.https)) {
        // use https if possible
        app = express.createServer(opts.https);
    } else {
        // fall back to http by default
        app = express();
    }
    app.enable('jsonp callback');
    app.disable('x-powered-by');
    app.disable('etag');

    // Fix: https://github.com/CartoDB/Windshaft-cartodb/issues/705
    // See: http://expressjs.com/en/4x/api.html#app.set
    app.set('json replacer', function (key, value) {
        if (value !== value) {
            return 'NaN';
        }

        if (value === Infinity) {
            return 'Infinity';
        }

        if (value === -Infinity) {
            return '-Infinity';
        }

        return value;
    });

    app.use(bodyParser.json());

    app.use(function bootstrap$prepareRequestResponse(req, res, next) {
        req.context = req.context || {};
        req.profiler = new Profiler({
            statsd_client: global.statsClient,
            profile: opts.useProfiler
        });

        if (global.environment && global.environment.api_hostname) {
            res.set('X-Served-By-Host', global.environment.api_hostname);
        }

        next();
    });

    // temporary measure until we upgrade to newer version expressjs so we can check err.status
    app.use(function(err, req, res, next) {
        if (err) {
            if (err.name === 'SyntaxError') {
                res.status(400).json({ errors: [err.name + ': ' + err.message] });
            } else {
                next(err);
            }
        } else {
            next();
        }
    });

    setupLogger(app, opts);

    return app;
}

function setupLogger(app, opts) {
    if (global.log4js && opts.log_format) {
        var loggerOpts = {
            // Allowing for unbuffered logging is mainly
            // used to avoid hanging during unit testing.
            // TODO: provide an explicit teardown function instead,
            //       releasing any event handler or timer set by
            //       this component.
            buffer: !opts.unbuffered_logging,
            // optional log format
            format: opts.log_format
        };
        app.use(global.log4js.connectLogger(global.log4js.getLogger(), _.defaults(loggerOpts, {level: 'info'})));
    }
}

function surrogateKeysCacheBackends(serverOptions) {
    var cacheBackends = [];

    if (serverOptions.varnish_purge_enabled) {
        cacheBackends.push(
            new VarnishHttpCacheBackend(serverOptions.varnish_host, serverOptions.varnish_http_port)
        );
    }

    if (serverOptions.fastly &&
        !!serverOptions.fastly.enabled && !!serverOptions.fastly.apiKey && !!serverOptions.fastly.serviceId) {
        cacheBackends.push(
            new FastlyCacheBackend(serverOptions.fastly.apiKey, serverOptions.fastly.serviceId)
        );
    }

    return cacheBackends;
}

function mapnikVersion(opts) {
    return opts.grainstore.mapnik_version || mapnik.versions.mapnik;
}
