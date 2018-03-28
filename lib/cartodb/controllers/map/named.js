const _ = require('underscore');
const ResourceLocator = require('../../models/resource-locator');
const cleanUpQueryParams = require('../../middleware/clean-up-query-params');
const credentials = require('../../middleware/credentials');
const dbConnSetup = require('../../middleware/db-conn-setup');
const authorize = require('../../middleware/authorize');
const initProfiler = require('./middlewares/init-profiler');
const checkJsonContentType = require('./middlewares/check-json-content-type');
const incrementMapViewCount = require('./middlewares/increment-map-view-count');
const augmentLayergroupData = require('./middlewares/augment-layergroup-data');
const cacheControlHeader = require('../../middleware/cache-control-header');
const cacheChannelHeader = require('../../middleware/cache-channel-header');
const surrogateKeyHeader = require('../../middleware/surrogate-key-header');
const lastModifiedHeader = require('../../middleware/last-modified-header');
const lastUpdatedTimeLayergroup = require('./middlewares/last-updated-time-layergroup');
const layerStats = require('./middlewares/layer-stats');
const sendResponse = require('../../middleware/send-response');
const NamedMapMapConfigProvider = require('../../models/mapconfig/provider/named-map-provider');
const CreateLayergroupMapConfigProvider = require('../../models/mapconfig/provider/create-layergroup-provider');
const LayergroupMetadata = require('../../utils/layergroup-metadata');
const rateLimit = require('../../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @param {MapBackend} mapBackend
 * @param metadataBackend
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @param {MapConfigAdapter} mapConfigAdapter
 * @param {StatsBackend} statsBackend
 * @constructor
 */
function NamedMapController (
    pgConnection,
    templateMaps,
    mapBackend,
    metadataBackend,
    surrogateKeysCache,
    userLimitsApi,
    layergroupAffectedTables,
    mapConfigAdapter,
    statsBackend,
    authApi
) {
    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.mapBackend = mapBackend;
    this.metadataBackend = metadataBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTables = layergroupAffectedTables;

    this.mapConfigAdapter = mapConfigAdapter;
    const resourceLocator = new ResourceLocator(global.environment);
    this.layergroupMetadata = new LayergroupMetadata(resourceLocator);

    this.statsBackend = statsBackend;
    this.authApi = authApi;
}

module.exports = NamedMapController;

NamedMapController.prototype.register = function (templateRouter) {
    templateRouter.get(
        `/:template_id/jsonp`,
        this.composeInstantiateTemplateMiddleware()
    );

    templateRouter.post(
        `/:template_id`,
        this.composeInstantiateTemplateMiddleware()
    );
};

NamedMapController.prototype.composeInstantiateTemplateMiddleware = function () {
    const isTemplateInstantiation = true;
    const useTemplateHash = true;
    const includeQuery = false;
    const label = 'NAMED MAP LAYERGROUP';
    const addContext = false;

    return [
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED),
        cleanUpQueryParams(['aggregation']),
        initProfiler(isTemplateInstantiation),
        checkJsonContentType(),
        checkInstantiteLayergroup(),
        getTemplate(
            this.templateMaps,
            this.pgConnection,
            this.metadataBackend,
            this.userLimitsApi,
            this.mapConfigAdapter,
            this.layergroupAffectedTables
        ),
        instantiateLayergroup(
            this.mapBackend,
            this.userLimitsApi,
            this.pgConnection,
            this.layergroupAffectedTables
        ),
        incrementMapViewCount(this.metadataBackend),
        augmentLayergroupData(),
        cacheControlHeader({ ttl: global.environment.varnish.layergroupTtl || 86400, revalidate: true }),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        lastModifiedHeader({ now: true }),
        lastUpdatedTimeLayergroup(),
        layerStats(this.pgConnection, this.statsBackend),
        setLayergroupIdHeader(this.templateMaps ,useTemplateHash),
        setDataviewsAndWidgetsUrlsToLayergroupMetadata(this.layergroupMetadata),
        setAnalysesMetadataToLayergroup(this.layergroupMetadata, includeQuery),
        setTurboCartoMetadataToLayergroup(this.layergroupMetadata),
        setAggregationMetadataToLayergroup(this.layergroupMetadata),
        setTilejsonMetadataToLayergroup(this.layergroupMetadata),
        sendResponse(),
        augmentError({ label, addContext })
    ];
};

function checkInstantiteLayergroup () {
    return function checkInstantiteLayergroupMiddleware(req, res, next) {
        if (req.method === 'GET') {
            const { callback, config } = req.query;

            if (callback === undefined || callback.length === 0) {
                return next(new Error('callback parameter should be present and be a function name'));
            }

            if (config) {
                try {
                    req.body = JSON.parse(config);
                } catch(e) {
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
    userLimitsApi,
    mapConfigAdapter,
    affectedTablesCache
) {
    return function getTemplateMiddleware (req, res, next) {
        const templateParams = req.body;
        const { user, dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { template_id } = req.params;
        const { auth_token } = req.query;

        const params = { dbuser, dbname, dbpassword, dbhost, dbport };

        const mapConfigProvider = new NamedMapMapConfigProvider(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsApi,
            mapConfigAdapter,
            affectedTablesCache,
            user,
            template_id,
            templateParams,
            auth_token,
            params
        );

        mapConfigProvider.getMapConfig((err, mapConfig, rendererParams) => {
            req.profiler.done('named.getMapConfig');
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

function instantiateLayergroup (mapBackend, userLimitsApi, pgConnection, affectedTablesCache) {
    return function instantiateLayergroupMiddleware (req, res, next) {
        const { user, mapConfig, rendererParams } = res.locals;
        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            rendererParams
        );

        mapBackend.createLayergroup(mapConfig, rendererParams, mapConfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
            if (err) {
                return next(err);
            }

            res.body = layergroup;

            const { mapConfigProvider } = res.locals;

            res.locals.analysesResults = mapConfigProvider.analysesResults;
            res.locals.template = mapConfigProvider.template;
            res.locals.context = mapConfigProvider.context;

            next();
        });
    };
}

function setLayergroupIdHeader (templateMaps, useTemplateHash) {
    return function setLayergroupIdHeaderMiddleware (req, res, next) {
        const { user, template } = res.locals;
        const layergroup = res.body;

        if (useTemplateHash) {
            var templateHash = templateMaps.fingerPrint(template).substring(0, 8);
            layergroup.layergroupid = `${user}@${templateHash}@${layergroup.layergroupid}`;
        }

        res.set('X-Layergroup-Id', layergroup.layergroupid);

        next();
    };
}

function setDataviewsAndWidgetsUrlsToLayergroupMetadata (layergroupMetadata) {
    return function setDataviewsAndWidgetsUrlsToLayergroupMetadataMiddleware (req, res, next) {
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addDataviewsAndWidgetsUrls(user, layergroup, mapConfig.obj());

        next();
    };
}

function setAnalysesMetadataToLayergroup (layergroupMetadata, includeQuery) {
    return function setAnalysesMetadataToLayergroupMiddleware (req, res, next) {
        const { user, analysesResults = [] } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);

        next();
    };
}

function setTurboCartoMetadataToLayergroup (layergroupMetadata) {
    return function setTurboCartoMetadataToLayergroupMiddleware (req, res, next) {
        const { mapConfig, context } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addTurboCartoContextMetadata(layergroup, mapConfig.obj(), context);

        next();
    };
}

function setAggregationMetadataToLayergroup (layergroupMetadata) {
    return function setAggregationMetadataToLayergroupMiddleware (req, res, next) {
        const { mapConfig, context } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addAggregationContextMetadata(layergroup, mapConfig.obj(), context);

        next();
    };
}

function setTilejsonMetadataToLayergroup (layergroupMetadata) {
    return function augmentLayergroupTilejsonMiddleware (req, res, next) {
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addTileJsonMetadata(layergroup, user, mapConfig);

        next();
    };
}

function augmentError (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function augmentErrorMiddleware (err, req, res, next) {
        req.profiler.done('error');
        const { mapConfig } = res.locals;

        if (addContext) {
            err = Number.isFinite(err.layerIndex) ? populateError(err, mapConfig) : err;
        }

        err.label = label;

        next(err);
    };
}

function populateError(err, mapConfig) {
    var error = new Error(err.message);
    error.http_status = err.http_status;

    if (!err.http_status && err.message.indexOf('column "the_geom_webmercator" does not exist') >= 0) {
        error.http_status = 400;
    }

    error.type = 'layer';
    error.subtype = err.message.indexOf('Postgis Plugin') >= 0 ? 'query' : undefined;
    error.layer = {
        id: mapConfig.getLayerId(err.layerIndex),
        index: err.layerIndex,
        type: mapConfig.layerType(err.layerIndex)
    };

    return error;
}
