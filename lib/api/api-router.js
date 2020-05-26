'use strict';

const { Router: router } = require('express');

const RedisPool = require('redis-mpool');
const cartodbRedis = require('cartodb-redis');

const { factory: windshaftFactory } = require('windshaft');

const PgConnection = require('../backends/pg-connection');
const AnalysisBackend = require('../backends/analysis');
const AnalysisStatusBackend = require('../backends/analysis-status');
const DataviewBackend = require('../backends/dataview');
const TemplateMaps = require('../backends/template-maps');
const PgQueryRunner = require('../backends/pg-query-runner');
const StatsBackend = require('../backends/stats');
const AuthBackend = require('../backends/auth');

const UserLimitsBackend = require('../backends/user-limits');
const OverviewsMetadataBackend = require('../backends/overviews-metadata');
const FilterStatsApi = require('../backends/filter-stats');
const TablesExtentBackend = require('../backends/tables-extent');
const ClusterBackend = require('../backends/cluster');
const PubSubMetricsBackend = require('../backends/metrics');

const LayergroupAffectedTablesCache = require('../cache/layergroup-affected-tables');
const SurrogateKeysCache = require('../cache/surrogate-keys-cache');
const VarnishHttpCacheBackend = require('../cache/backend/varnish-http');
const FastlyCacheBackend = require('../cache/backend/fastly');
const NamedMapProviderCache = require('../cache/named-map-provider-cache');
const NamedMapsCacheEntry = require('../cache/model/named-maps-entry');
const NamedMapProviderCacheReporter = require('../stats/reporter/named-map-provider-cache');

const SqlWrapMapConfigAdapter = require('../models/mapconfig/adapter/sql-wrap-mapconfig-adapter');
const MapConfigNamedLayersAdapter = require('../models/mapconfig/adapter/mapconfig-named-layers-adapter');
const MapConfigBufferSizeAdapter = require('../models/mapconfig/adapter/mapconfig-buffer-size-adapter');
const AnalysisMapConfigAdapter = require('../models/mapconfig/adapter/analysis-mapconfig-adapter');
const MapConfigOverviewsAdapter = require('../models/mapconfig/adapter/mapconfig-overviews-adapter');
const TurboCartoAdapter = require('../models/mapconfig/adapter/turbo-carto-adapter');
const DataviewsWidgetsAdapter = require('../models/mapconfig/adapter/dataviews-widgets-adapter');
const AggregationMapConfigAdapter = require('../models/mapconfig/adapter/aggregation-mapconfig-adapter');
const MapConfigAdapter = require('../models/mapconfig/adapter');
const VectorMapConfigAdapter = require('../models/mapconfig/adapter/vector-mapconfig-adapter');

const ResourceLocator = require('../models/resource-locator');
const LayergroupMetadata = require('../utils/layergroup-metadata');
const RendererStatsReporter = require('../stats/reporter/renderer');

const initializeStatusCode = require('./middlewares/initialize-status-code');
const logger = require('./middlewares/logger');
const bodyParser = require('body-parser');
const servedByHostHeader = require('./middlewares/served-by-host-header');
const stats = require('./middlewares/stats');
const lzmaMiddleware = require('./middlewares/lzma');
const cors = require('./middlewares/cors');
const user = require('./middlewares/user');
const sendResponse = require('./middlewares/send-response');
const syntaxError = require('./middlewares/syntax-error');
const errorMiddleware = require('./middlewares/error-middleware');
const clientHeader = require('./middlewares/client-header');

const MapRouter = require('./map/map-router');
const TemplateRouter = require('./template/template-router');

const getOnTileErrorStrategy = require('../utils/on-tile-error-strategy');

module.exports = class ApiRouter {
    constructor ({ serverOptions, environmentOptions }) {
        this.serverOptions = serverOptions;

        const redisOptions = Object.assign({
            name: 'windshaft-server',
            unwatchOnRelease: false,
            noReadyCheck: true
        }, environmentOptions.redis);

        const redisPool = new RedisPool(redisOptions);

        redisPool.on('status', function (status) {
            var keyPrefix = 'windshaft.redis-pool.' + status.name + '.db' + status.db + '.';
            global.statsClient.gauge(keyPrefix + 'count', status.count);
            global.statsClient.gauge(keyPrefix + 'unused', status.unused);
            global.statsClient.gauge(keyPrefix + 'waiting', status.waiting);
        });

        const windshaftLogger = environmentOptions.log_windshaft && global.log4js
            ? global.log4js.getLogger('[windshaft]')
            : null;

        const { rendererCache, tileBackend, attributesBackend, previewBackend, mapBackend, mapStore } = windshaftFactory({
            rendererOptions: serverOptions,
            redisPool,
            onTileErrorStrategy: getOnTileErrorStrategy({ enabled: environmentOptions.enabledFeatures.onTileErrorStrategy }),
            logger: windshaftLogger
        });

        const rendererStatsReporter = new RendererStatsReporter(rendererCache, serverOptions.renderCache.statsInterval);
        rendererStatsReporter.start();

        const metadataBackend = cartodbRedis({ pool: redisPool });
        const pgConnection = new PgConnection(metadataBackend);

        const surrogateKeysCacheBackends = createSurrogateKeysCacheBackends(serverOptions);
        const surrogateKeysCache = new SurrogateKeysCache(surrogateKeysCacheBackends);
        const templateMaps = createTemplateMaps({ redisPool, surrogateKeysCache });

        const analysisStatusBackend = new AnalysisStatusBackend();
        const analysisBackend = new AnalysisBackend(metadataBackend, serverOptions.analysis);
        const dataviewBackend = new DataviewBackend(analysisBackend);
        const statsBackend = new StatsBackend();
        const clusterBackend = new ClusterBackend();

        const userLimitsBackend = new UserLimitsBackend(metadataBackend, {
            limits: {
                cacheOnTimeout: serverOptions.renderer.mapnik.limits.cacheOnTimeout || false,
                render: serverOptions.renderer.mapnik.limits.render || 0,
                rateLimitsEnabled: global.environment.enabledFeatures.rateLimitsEnabled
            }
        });
        const authBackend = new AuthBackend(pgConnection, metadataBackend, mapStore, templateMaps);

        const layergroupAffectedTablesCache = new LayergroupAffectedTablesCache();

        if (process.env.NODE_ENV === 'test') {
            this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        }

        const pgQueryRunner = new PgQueryRunner(pgConnection);
        const overviewsMetadataBackend = new OverviewsMetadataBackend(pgQueryRunner);

        const filterStatsBackend = new FilterStatsApi(pgQueryRunner);
        const tablesExtentBackend = new TablesExtentBackend(pgQueryRunner);

        const mapConfigAdapter = new MapConfigAdapter(
            new MapConfigNamedLayersAdapter(templateMaps, pgConnection),
            new MapConfigBufferSizeAdapter(),
            new SqlWrapMapConfigAdapter(),
            new DataviewsWidgetsAdapter(),
            new AnalysisMapConfigAdapter(analysisBackend),
            new VectorMapConfigAdapter(pgConnection),
            new AggregationMapConfigAdapter(pgConnection),
            new MapConfigOverviewsAdapter(overviewsMetadataBackend, filterStatsBackend),
            new TurboCartoAdapter()
        );

        const resourceLocator = new ResourceLocator(global.environment);
        const layergroupMetadata = new LayergroupMetadata(resourceLocator);

        const namedMapProviderCache = new NamedMapProviderCache(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsBackend,
            mapConfigAdapter,
            layergroupAffectedTablesCache
        );

        const namedMapProviderCacheReporter = new NamedMapProviderCacheReporter({
            namedMapProviderCache,
            intervalInMilliseconds: serverOptions.renderCache.statsInterval
        });
        namedMapProviderCacheReporter.start();

        const metricsBackend = new PubSubMetricsBackend(serverOptions.pubSubMetrics);

        const collaborators = {
            config: serverOptions,
            analysisStatusBackend,
            attributesBackend,
            dataviewBackend,
            previewBackend,
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache,
            templateMaps,
            mapBackend,
            metadataBackend,
            mapConfigAdapter,
            statsBackend,
            layergroupMetadata,
            namedMapProviderCache,
            tablesExtentBackend,
            clusterBackend,
            metricsBackend
        };

        this.metadataBackend = metadataBackend;
        this.mapRouter = new MapRouter({ collaborators });
        this.templateRouter = new TemplateRouter({ collaborators });
    }

    route (app, routes) {
        // FIXME: we need a better way to reset cache while running tests
        if (process.env.NODE_ENV === 'test') {
            app.layergroupAffectedTablesCache = this.layergroupAffectedTablesCache;
        }

        routes.forEach(route => {
            const apiRouter = router({ mergeParams: true });
            const { paths, middlewares = [] } = route;

            middlewares.forEach(middleware => apiRouter.use(middleware()));

            apiRouter.use(logger(this.serverOptions));
            apiRouter.use(initializeStatusCode());
            apiRouter.use(bodyParser.json());
            apiRouter.use(servedByHostHeader());
            apiRouter.use(clientHeader());
            apiRouter.use(stats({
                enabled: this.serverOptions.useProfiler,
                statsClient: global.statsClient
            }));
            apiRouter.use(lzmaMiddleware());
            apiRouter.use(cors());
            apiRouter.use(user(this.metadataBackend));

            this.templateRouter.route(apiRouter, route.template);
            this.mapRouter.route(apiRouter, route.map);

            apiRouter.use(sendResponse());
            apiRouter.use(syntaxError());
            apiRouter.use(errorMiddleware());

            paths.forEach(path => app.use(path, apiRouter));
        });
    }
};

function createTemplateMaps ({ redisPool, surrogateKeysCache }) {
    const templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    function invalidateNamedMap (owner, templateName) {
        var startTime = Date.now();
        surrogateKeysCache.invalidate(new NamedMapsCacheEntry(owner, templateName), function (err) {
            var logMessage = JSON.stringify({
                username: owner,
                type: 'named_map_invalidation',
                elapsed: Date.now() - startTime,
                error: err ? JSON.stringify(err.message) : undefined
            });
            if (err) {
                global.logger.warn(logMessage);
            } else {
                global.logger.info(logMessage);
            }
        });
    }

    ['update', 'delete'].forEach(function (eventType) {
        templateMaps.on(eventType, invalidateNamedMap);
    });

    return templateMaps;
}

function createSurrogateKeysCacheBackends (serverOptions) {
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
