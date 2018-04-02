const { Router: router } = require('express');

const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');

const windshaft = require('windshaft');

const PgConnection = require('../backends/pg_connection');
const AnalysisBackend = require('../backends/analysis');
const AnalysisStatusBackend = require('../backends/analysis-status');
const DataviewBackend = require('../backends/dataview');
const TemplateMaps = require('../backends/template_maps.js');
const PgQueryRunner = require('../backends/pg_query_runner');
const StatsBackend = require('../backends/stats');

const AuthApi = require('../api/auth_api');
const UserLimitsApi = require('../api/user_limits_api');
const OverviewsMetadataApi = require('../api/overviews_metadata_api');
const FilterStatsApi = require('../api/filter_stats_api');
const TablesExtentApi = require('../api/tables_extent_api');

const LayergroupAffectedTablesCache = require('../cache/layergroup_affected_tables');
const SurrogateKeysCache = require('../cache/surrogate_keys_cache');
const VarnishHttpCacheBackend = require('../cache/backend/varnish_http');
const FastlyCacheBackend = require('../cache/backend/fastly');
const NamedMapProviderCache = require('../cache/named_map_provider_cache');
const NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

const SqlWrapMapConfigAdapter = require('../models/mapconfig/adapter/sql-wrap-mapconfig-adapter');
const MapConfigNamedLayersAdapter = require('../models/mapconfig/adapter/mapconfig-named-layers-adapter');
const MapConfigBufferSizeAdapter = require('../models/mapconfig/adapter/mapconfig-buffer-size-adapter');
const AnalysisMapConfigAdapter = require('../models/mapconfig/adapter/analysis-mapconfig-adapter');
const MapConfigOverviewsAdapter = require('../models/mapconfig/adapter/mapconfig-overviews-adapter');
const TurboCartoAdapter = require('../models/mapconfig/adapter/turbo-carto-adapter');
const DataviewsWidgetsAdapter = require('../models/mapconfig/adapter/dataviews-widgets-adapter');
const AggregationMapConfigAdapter = require('../models/mapconfig/adapter/aggregation-mapconfig-adapter');
const MapConfigAdapter = require('../models/mapconfig/adapter');

const ResourceLocator = require('../models/resource-locator');
const LayergroupMetadata = require('../utils/layergroup-metadata');
const RendererStatsReporter = require('../stats/reporter/renderer');

const AnalysisLayergroupController = require('./layergroup/analysis');
const AttributesLayergroupController = require('./layergroup/attributes');
const DataviewLayergroupController = require('./layergroup/dataview');
const PreviewLayergroupController = require('./layergroup/preview');
const TileLayergroupController = require('./layergroup/tile');

const AnonymousMapController = require('./map/anonymous');
const NamedMapController = require('./map/named');

const AdminTemplateController = require('./template/admin');
const PreviewTemplateController = require('./template/preview');
const TileTemplateController = require('./template/tile');

const AnalysesController = require('./analyses');

const ServerInfoController = require('./server-info');

module.exports = class ControllersFactory {
    constructor ({ serverOptions, environmentOptions }) {
        const redisOptions = Object.assign({}, environmentOptions.redis, {
            name: 'windshaft-server',
            unwatchOnRelease: false,
            noReadyCheck: true
        });

        const redisPool = new RedisPool(redisOptions);

        redisPool.on('status', function(status) {
            var keyPrefix = 'windshaft.redis-pool.' + status.name + '.db' + status.db + '.';
            global.statsClient.gauge(keyPrefix + 'count', status.count);
            global.statsClient.gauge(keyPrefix + 'unused', status.unused);
            global.statsClient.gauge(keyPrefix + 'waiting', status.waiting);
        });

        const metadataBackend = cartodbRedis({ pool: redisPool });
        const pgConnection = new PgConnection(metadataBackend);

        const mapStore = new windshaft.storage.MapStore({
            pool: redisPool,
            expire_time: serverOptions.grainstore.default_layergroup_ttl
        });

        const rendererFactory = createRendererFactory({ redisPool, serverOptions, environmentOptions });

        const rendererCacheOpts = Object.assign({}, serverOptions.renderCache || {}, {
            ttl: 60000, // 60 seconds TTL by default
            statsInterval: 60000 // reports stats every milliseconds defined here
        });
        const rendererCache = new windshaft.cache.RendererCache(rendererFactory, rendererCacheOpts);
        const rendererStatsReporter = new RendererStatsReporter(rendererCache, rendererCacheOpts.statsInterval);
        rendererStatsReporter.start();

        const tileBackend = new windshaft.backend.Tile(rendererCache);
        const attributesBackend = new windshaft.backend.Attributes();
        const previewBackend = new windshaft.backend.Preview(rendererCache);
        const mapValidatorBackend = new windshaft.backend.MapValidator(tileBackend, attributesBackend);
        const mapBackend = new windshaft.backend.Map(rendererCache, mapStore, mapValidatorBackend);

        const surrogateKeysCacheBackends = createSurrogateKeysCacheBackends(serverOptions);
        const surrogateKeysCache = new SurrogateKeysCache(surrogateKeysCacheBackends);
        const templateMaps = createTemplateMaps({ redisPool, surrogateKeysCache });

        const analysisStatusBackend = new AnalysisStatusBackend();
        const analysisBackend = new AnalysisBackend(metadataBackend, serverOptions.analysis);
        const dataviewBackend = new DataviewBackend(analysisBackend);
        const statsBackend = new StatsBackend();

        const userLimitsApi = new UserLimitsApi(metadataBackend, {
            limits: {
                cacheOnTimeout: serverOptions.renderer.mapnik.limits.cacheOnTimeout || false,
                render: serverOptions.renderer.mapnik.limits.render || 0,
                rateLimitsEnabled: global.environment.enabledFeatures.rateLimitsEnabled
            }
        });
        const authApi = new AuthApi(pgConnection, metadataBackend, mapStore, templateMaps);

        const layergroupAffectedTablesCache = new LayergroupAffectedTablesCache();

        if (process.env.NODE_ENV === 'test') {
            this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        }

        const pgQueryRunner = new PgQueryRunner(pgConnection);
        const overviewsMetadataApi = new OverviewsMetadataApi(pgQueryRunner);

        const filterStatsApi = new FilterStatsApi(pgQueryRunner);
        const tablesExtentApi = new TablesExtentApi(pgQueryRunner);

        const mapConfigAdapter = new MapConfigAdapter(
            new MapConfigNamedLayersAdapter(templateMaps, pgConnection),
            new MapConfigBufferSizeAdapter(),
            new SqlWrapMapConfigAdapter(),
            new DataviewsWidgetsAdapter(),
            new AnalysisMapConfigAdapter(analysisBackend),
            new AggregationMapConfigAdapter(pgConnection),
            new MapConfigOverviewsAdapter(overviewsMetadataApi, filterStatsApi),
            new TurboCartoAdapter()
        );

        const resourceLocator = new ResourceLocator(global.environment);
        const layergroupMetadata = new LayergroupMetadata(resourceLocator);

        const namedMapProviderCache = new NamedMapProviderCache(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsApi,
            mapConfigAdapter,
            layergroupAffectedTablesCache
        );

        ['update', 'delete'].forEach(function(eventType) {
            templateMaps.on(eventType, namedMapProviderCache.invalidate.bind(namedMapProviderCache));
        });

        const versions = getAndValidateVersions(serverOptions);

        this.mapConfigBasePath = serverOptions.base_url_mapconfig;
        this.templateBasePath = serverOptions.base_url_templated;

        this.analysisLayergroupController = new AnalysisLayergroupController(
            analysisStatusBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.attributesLayergroupController = new AttributesLayergroupController(
            attributesBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.dataviewLayergroupController = new DataviewLayergroupController(
            dataviewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.previewLayergroupController = new PreviewLayergroupController(
            previewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.tileLayergroupController = new TileLayergroupController(
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.anonymousMapController = new AnonymousMapController(
            pgConnection,
            templateMaps,
            mapBackend,
            metadataBackend,
            surrogateKeysCache,
            userLimitsApi,
            layergroupAffectedTablesCache,
            mapConfigAdapter,
            statsBackend,
            authApi,
            layergroupMetadata
        );

        this.namedMapController = new NamedMapController(
            pgConnection,
            templateMaps,
            mapBackend,
            metadataBackend,
            surrogateKeysCache,
            userLimitsApi,
            layergroupAffectedTablesCache,
            mapConfigAdapter,
            statsBackend,
            authApi,
            layergroupMetadata
        );

        this.tileTemplateController = new TileTemplateController(
            namedMapProviderCache,
            tileBackend,
            surrogateKeysCache,
            pgConnection,
            authApi,
            userLimitsApi
        );

        this.previewTemplateController = new PreviewTemplateController(
            namedMapProviderCache,
            previewBackend,
            surrogateKeysCache,
            tablesExtentApi,
            metadataBackend,
            pgConnection,
            authApi,
            userLimitsApi
        );

        this.adminTemplateController = new AdminTemplateController(
            authApi,
            templateMaps,
            userLimitsApi
        );

        this.analysesController = new AnalysesController(
            pgConnection,
            authApi,
            userLimitsApi
        );

        this.serverInfoController = new ServerInfoController(versions);
    }

    regist (app) {
        if (process.env.NODE_ENV === 'test') {
            app.layergroupAffectedTablesCache = this.layergroupAffectedTablesCache;
        }

        const mapRouter = router();

        this.analysisLayergroupController.register(mapRouter);
        this.attributesLayergroupController.register(mapRouter);
        this.dataviewLayergroupController.register(mapRouter);
        this.previewLayergroupController.register(mapRouter);
        this.tileLayergroupController.register(mapRouter);
        this.anonymousMapController.register(mapRouter);
        this.previewTemplateController.register(mapRouter);
        this.analysesController.register(mapRouter);

        app.use(this.mapConfigBasePath, mapRouter);

        const templateRouter = router();

        this.namedMapController.register(templateRouter);
        this.tileTemplateController.register(templateRouter);
        this.adminTemplateController.register(templateRouter);

        app.use(this.templateBasePath, templateRouter);

        const monitorRouter = router();

        this.serverInfoController.register(monitorRouter);

        app.use('/', monitorRouter);
    }
};


function createTemplateMaps ({ redisPool, surrogateKeysCache }) {
    const templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

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

    return templateMaps;
}

function createSurrogateKeysCacheBackends(serverOptions) {
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

const timeoutErrorTilePath = __dirname + '/../../../assets/render-timeout-fallback.png';
const timeoutErrorTile = require('fs').readFileSync(timeoutErrorTilePath, {encoding: null});

function createRendererFactory ({ redisPool, serverOptions, environmentOptions }) {
    var onTileErrorStrategy;
    if (environmentOptions.enabledFeatures.onTileErrorStrategy !== false) {
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

    const rendererFactory = new windshaft.renderer.Factory({
        onTileErrorStrategy: onTileErrorStrategy,
        mapnik: {
            redisPool: redisPool,
            grainstore: serverOptions.grainstore,
            mapnik: serverOptions.renderer.mapnik
        },
        http: serverOptions.renderer.http,
        mvt: serverOptions.renderer.mvt
    });


    return rendererFactory;
}

function getAndValidateVersions(options) {
    // jshint undef:false
    var warn = console.warn.bind(console);
    // jshint undef:true

    var packageDefinition = require('../../../package.json');

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
    if (windshaft.mapnik.versions.mapnik !== options.grainstore.mapnik_version) {
        warn('WARNING: detected mapnik version (' + windshaft.mapnik.versions.mapnik + ')' +
            ' != configured mapnik version (' + options.grainstore.mapnik_version + ')');
    }

    return installedDependenciesVersions;
}
