'use strict';

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
const NamedMapMapConfigProvider = require('../../models/mapconfig/provider/named-map-provider');
const CreateLayergroupMapConfigProvider = require('../../models/mapconfig/provider/create-layergroup-provider');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const metrics = require('../middlewares/metrics');

module.exports = class NamedMapController {
    /**
     * @param {PgConnection} pgConnection
     * @param {TemplateMaps} templateMaps
     * @param {MapBackend} mapBackend
     * @param metadataBackend
     * @param {SurrogateKeysCache} surrogateKeysCache
     * @param {UserLimitsBackend} userLimitsBackend
     * @param {LayergroupAffectedTables} layergroupAffectedTables
     * @param {MapConfigAdapter} mapConfigAdapter
     * @param {StatsBackend} statsBackend
     * @param {AuthBackend} authBackend
     * @param layergroupMetadata
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

    route (templateRouter) {
        templateRouter.get('/:template_id/jsonp', this.middlewares());
        templateRouter.post('/:template_id', this.middlewares());
    }

    middlewares () {
        const isTemplateInstantiation = true;
        const useTemplateHash = true;
        const includeQuery = false;
        const label = 'NAMED MAP LAYERGROUP';
        const addContext = false;
        const metricsTags = {
            event: 'map_view',
            attributes: { map_type: 'named' },
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
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED),
            cleanUpQueryParams(['aggregation']),
            initProfiler(isTemplateInstantiation),
            checkJsonContentType(),
            checkInstantiteLayergroup(),
            getTemplate(
                this.templateMaps,
                this.pgConnection,
                this.metadataBackend,
                this.userLimitsBackend,
                this.mapConfigAdapter,
                this.layergroupAffectedTables
            ),
            instantiateLayergroup(
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

function checkInstantiteLayergroup () {
    return function checkInstantiteLayergroupMiddleware (req, res, next) {
        if (req.method === 'GET') {
            const { callback, config } = req.query;

            if (callback === undefined || callback.length === 0) {
                return next(new Error('callback parameter should be present and be a function name'));
            }

            if (config) {
                try {
                    req.body = JSON.parse(config);
                } catch (e) {
                    return next(new Error('Invalid config parameter, should be a valid JSON'));
                }
            }
        }

        req.profiler.done('checkInstantiteLayergroup');

        return next();
    };
}

function getTemplate (
    templateMaps,
    pgConnection,
    metadataBackend,
    userLimitsBackend,
    mapConfigAdapter,
    affectedTablesCache
) {
    return function getTemplateMiddleware (req, res, next) {
        const templateParams = req.body;
        const { user, dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { template_id: templateId } = req.params;
        const { auth_token: authToken } = req.query;

        const params = Object.assign({ dbuser, dbname, dbpassword, dbhost, dbport }, req.query);

        const mapConfigProvider = new NamedMapMapConfigProvider(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsBackend,
            mapConfigAdapter,
            affectedTablesCache,
            user,
            templateId,
            templateParams,
            authToken,
            params
        );

        mapConfigProvider.getMapConfig((err, mapConfig, rendererParams, context, stats = {}) => {
            req.profiler.done('named.getMapConfig');

            stats.mapType = 'named';
            req.profiler.add(stats);

            if (err) {
                return next(err);
            }

            res.locals.mapConfig = mapConfig;
            res.locals.rendererParams = rendererParams;
            res.locals.mapConfigProvider = mapConfigProvider;

            next();
        });
    };
}

function instantiateLayergroup (mapBackend, userLimitsBackend, pgConnection, affectedTablesCache) {
    return function instantiateLayergroupMiddleware (req, res, next) {
        const { user, mapConfig, rendererParams } = res.locals;
        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsBackend,
            pgConnection,
            affectedTablesCache,
            rendererParams
        );

        mapBackend.createLayergroup(mapConfig, rendererParams, mapConfigProvider, (err, layergroup, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                return next(err);
            }

            res.statusCode = 200;
            res.body = layergroup;

            const { mapConfigProvider } = res.locals;

            res.locals.analysesResults = mapConfigProvider.analysesResults;
            res.locals.template = mapConfigProvider.template;
            res.locals.context = mapConfigProvider.context;

            next();
        });
    };
}
