'use strict';

const windshaft = require('windshaft');
const MapConfig = windshaft.model.MapConfig;
const Datasource = windshaft.model.Datasource;
const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const initProfiler = require('../middlewares/init-profiler');
const checkJsonContentType = require('../middlewares/check-json-content-type');
const incrementMapViewCount = require('../middlewares/increment-map-view-count');
const augmentLayergroupData = require('../middlewares/augment-layergroup-data');
const cacheControlHeader = require('../middlewares/cache-control-header');
const cacheChannelHeader = require('../middlewares/cache-channel-header');
const surrogateKeyHeader = require('../middlewares/surrogate-key-header');
const lastModifiedHeader = require('../middlewares/last-modified-header');
const lastUpdatedTimeLayergroup = require('../middlewares/last-updated-time-layergroup');
const layerStats = require('../middlewares/layer-stats');
const layergroupIdHeader = require('../middlewares/layergroup-id-header');
const layergroupMetadata = require('../middlewares/layergroup-metadata');
const mapError = require('../middlewares/map-error');
const CreateLayergroupMapConfigProvider = require('../../models/mapconfig/provider/create-layergroup-provider');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const metrics = require('../middlewares/metrics');

module.exports = class AnonymousMapController {
    /**
     * @param {AuthBackend} authBackend
     * @param {PgConnection} pgConnection
     * @param {TemplateMaps} templateMaps
     * @param {MapBackend} mapBackend
     * @param metadataBackend
     * @param {SurrogateKeysCache} surrogateKeysCache
     * @param {UserLimitsBackend} userLimitsBackend
     * @param {LayergroupAffectedTables} layergroupAffectedTables
     * @param {MapConfigAdapter} mapConfigAdapter
     * @param {StatsBackend} statsBackend
     * @constructor
     */
    constructor (
        config,
        pgConnection,
        templateMaps,
        mapBackend,
        metadataBackend,
        surrogateKeysCache,
        userLimitsBackend,
        layergroupAffectedTables,
        mapConfigAdapter,
        statsBackend,
        authBackend,
        layergroupMetadata,
        metricsBackend
    ) {
        this.config = config;
        this.pgConnection = pgConnection;
        this.templateMaps = templateMaps;
        this.mapBackend = mapBackend;
        this.metadataBackend = metadataBackend;
        this.surrogateKeysCache = surrogateKeysCache;
        this.userLimitsBackend = userLimitsBackend;
        this.layergroupAffectedTables = layergroupAffectedTables;
        this.mapConfigAdapter = mapConfigAdapter;
        this.statsBackend = statsBackend;
        this.authBackend = authBackend;
        this.layergroupMetadata = layergroupMetadata;
        this.metricsBackend = metricsBackend;
    }

    route (mapRouter) {
        mapRouter.options('/');
        mapRouter.get('/', this.middlewares());
        mapRouter.post('/', this.middlewares());
    }

    middlewares () {
        const isTemplateInstantiation = false;
        const useTemplateHash = false;
        const includeQuery = true;
        const label = 'ANONYMOUS LAYERGROUP';
        const addContext = true;
        const metricsTags = {
            event: 'map_view',
            attributes: { map_type: 'anonymous' },
            from: {
                req: {
                    query: { client: 'client' }
                }
            }
        };

        return [
            metrics({
                enabled: this.config.pubSubMetrics.enabled,
                metricsBackend: this.metricsBackend,
                logger: global.logger,
                tags: metricsTags
            }),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS),
            cleanUpQueryParams(['aggregation']),
            initProfiler(isTemplateInstantiation),
            checkJsonContentType(),
            checkCreateLayergroup(),
            prepareAdapterMapConfig(this.mapConfigAdapter),
            createLayergroup(
                this.mapBackend,
                this.userLimitsBackend,
                this.pgConnection,
                this.layergroupAffectedTables
            ),
            incrementMapViewCount(this.metadataBackend),
            augmentLayergroupData(),
            cacheControlHeader({ ttl: global.environment.varnish.layergroupTtl || 86400, revalidate: true }),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            lastUpdatedTimeLayergroup(),
            layerStats(this.pgConnection, this.statsBackend),
            layergroupIdHeader(this.templateMaps, useTemplateHash),
            layergroupMetadata(this.layergroupMetadata, includeQuery),
            mapError({ label, addContext })
        ];
    }
};

function checkCreateLayergroup () {
    return function checkCreateLayergroupMiddleware (req, res, next) {
        if (req.method === 'GET') {
            const { config } = req.query;

            if (!config) {
                return next(new Error('layergroup GET needs a "config" parameter'));
            }

            try {
                req.body = JSON.parse(config);
            } catch (err) {
                return next(err);
            }
        }

        req.profiler.done('checkCreateLayergroup');
        return next();
    };
}

function prepareAdapterMapConfig (mapConfigAdapter) {
    return function prepareAdapterMapConfigMiddleware (req, res, next) {
        const requestMapConfig = req.body;

        const { user, api_key: apiKey } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const params = Object.assign({ dbuser, dbname, dbpassword, dbhost, dbport }, req.query);

        const context = {
            analysisConfiguration: {
                user,
                db: {
                    host: dbhost,
                    port: dbport,
                    dbname: dbname,
                    user: dbuser,
                    pass: dbpassword
                },
                batch: {
                    username: user,
                    apiKey
                }
            }
        };

        mapConfigAdapter.getMapConfig(user,
            requestMapConfig,
            params,
            context,
            (err, requestMapConfig, stats = { overviewsAddedToMapconfig: false }) => {
                req.profiler.done('anonymous.getMapConfig');

                stats.mapType = 'anonymous';
                req.profiler.add(stats);

                if (err) {
                    return next(err);
                }

                req.body = requestMapConfig;
                res.locals.context = context;

                next();
            });
    };
}

function createLayergroup (mapBackend, userLimitsBackend, pgConnection, affectedTablesCache) {
    return function createLayergroupMiddleware (req, res, next) {
        const requestMapConfig = req.body;

        const { context } = res.locals;
        const { user, cache_buster: cacheBuster, api_key: apiKey } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;

        const params = {
            cache_buster: cacheBuster,
            api_key: apiKey,
            dbuser,
            dbname,
            dbpassword,
            dbhost,
            dbport
        };

        const datasource = context.datasource || Datasource.EmptyDatasource();
        const mapConfig = new MapConfig(requestMapConfig, datasource);

        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsBackend,
            pgConnection,
            affectedTablesCache,
            params
        );

        res.locals.mapConfig = mapConfig;
        res.locals.mapConfigProvider = mapConfigProvider;
        res.locals.analysesResults = context.analysesResults;

        const mapParams = { dbuser, dbname, dbpassword, dbhost, dbport };

        mapBackend.createLayergroup(mapConfig, mapParams, mapConfigProvider, (err, layergroup, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                return next(err);
            }

            res.statusCode = 200;
            res.body = layergroup;

            next();
        });
    };
}
