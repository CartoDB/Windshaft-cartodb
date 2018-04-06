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

const logger = require('../middleware/logger');
const bodyParser = require('body-parser');
const servedByHostHeader = require('../middleware/served-by-host-header');
const stats = require('../middleware/stats');
const lzmaMiddleware = require('../middleware/lzma');
const cors = require('../middleware/cors');
const user = require('../middleware/user');
const sendResponse = require('../middleware/send-response');
const syntaxError = require('../middleware/syntax-error');
const errorMiddleware = require('../middleware/error-middleware');

const MapRouter = require('./map-router');
const TemplateRouter = require('./template-router');

module.exports = class ApiRouter {
    constructor ({ serverOptions, environmentOptions }) {
        this.serverOptions = serverOptions;

        const redisOptions = Object.assign({}, environmentOptions.redis, {
            name: 'windshaft-server',
            unwatchOnRelease: false,
            noReadyCheck: true
        });

        const redisPool = new RedisPool(redisOptions);

        redisPool.on('status', function (status) {
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

        const collaborators = {
            analysisStatusBackend,
            attributesBackend,
            dataviewBackend,
            previewBackend,
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache,
            templateMaps,
            mapBackend,
            metadataBackend,
            mapConfigAdapter,
            statsBackend,
            layergroupMetadata,
            namedMapProviderCache,
            tablesExtentApi
        };

        this.mapRouter = new MapRouter({ collaborators });
        this.templateRouter = new TemplateRouter({ collaborators });
    }

    register (app) {
        // FIXME: we need a better way to reset cache while running tests
        if (process.env.NODE_ENV === 'test') {
            app.layergroupAffectedTablesCache = this.layergroupAffectedTablesCache;
        }

        const apiRouter = router();

        apiRouter.use(logger(this.serverOptions));
        apiRouter.use(bodyParser.json());
        apiRouter.use(servedByHostHeader());
        apiRouter.use(stats({
            enabled: this.serverOptions.useProfiler,
            statsClient: global.statsClient
        }));
        apiRouter.use(lzmaMiddleware());
        apiRouter.use(cors());
        apiRouter.use(user());

        this.templateRouter.register(apiRouter);
        this.mapRouter.register(apiRouter);

        apiRouter.use(sendResponse());
        apiRouter.use(syntaxError());
        apiRouter.use(errorMiddleware());

        const paths = [
            '/api/v1',
            '/user/:user/api/v1',
            '/tiles', // Deprecated
            '/database/:dbname' // Deprecated: used in ported test from windshaft
        ];

        app.use(`(?:${paths.join('|')})`, apiRouter);
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