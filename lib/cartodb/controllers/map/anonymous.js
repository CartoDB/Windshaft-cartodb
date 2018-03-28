const windshaft = require('windshaft');
const MapConfig = windshaft.model.MapConfig;
const Datasource = windshaft.model.Datasource;
const ResourceLocator = require('../../models/resource-locator');
const cors = require('../../middleware/cors');
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
const layergroupIdHeader = require('./middlewares/layergroup-id-header');
const layergroupMetadata = require('./middlewares/layergroup-metadata');
const mapError = require('./middlewares/map-error');
const sendResponse = require('../../middleware/send-response');
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
function AnonymousMapController (
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

module.exports = AnonymousMapController;

AnonymousMapController.prototype.register = function (mapRouter) {
    mapRouter.get('/', this.composeCreateMapMiddleware());
    mapRouter.post('/', this.composeCreateMapMiddleware());
    mapRouter.options('/', cors('Content-Type'));
};

AnonymousMapController.prototype.composeCreateMapMiddleware = function () {
    const isTemplateInstantiation = false;
    const useTemplateHash = false;
    const includeQuery = true;
    const label = 'ANONYMOUS LAYERGROUP';
    const addContext = true;

    return [
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS),
        cleanUpQueryParams(['aggregation']),
        initProfiler(isTemplateInstantiation),
        checkJsonContentType(),
        checkCreateLayergroup(),
        prepareAdapterMapConfig(this.mapConfigAdapter),
        createLayergroup (
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
        layergroupIdHeader(this.templateMaps ,useTemplateHash),
        layergroupMetadata(this.layergroupMetadata, includeQuery),
        sendResponse(),
        mapError({ label, addContext })
    ];
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
    return function prepareAdapterMapConfigMiddleware(req, res, next) {
        const requestMapConfig = req.body;

        const { user, api_key } = res.locals;
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
                    apiKey: api_key
                }
            }
        };

        mapConfigAdapter.getMapConfig(user, requestMapConfig, params, context, (err, requestMapConfig) => {
            req.profiler.done('anonymous.getMapConfig');
            if (err) {
                return next(err);
            }

            req.body = requestMapConfig;
            res.locals.context = context;

            next();
        });
    };
}

function createLayergroup (mapBackend, userLimitsApi, pgConnection, affectedTablesCache) {
    return function createLayergroupMiddleware (req, res, next) {
        const requestMapConfig = req.body;

        const { context } = res.locals;
        const { user, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;

        const params = {
            cache_buster, api_key,
            dbuser, dbname, dbpassword, dbhost, dbport
        };

        const datasource = context.datasource || Datasource.EmptyDatasource();
        const mapConfig = new MapConfig(requestMapConfig, datasource);

        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            params
        );

        res.locals.mapConfig = mapConfig;
        res.locals.analysesResults = context.analysesResults;

        const mapParams = { dbuser, dbname, dbpassword, dbhost, dbport };

        mapBackend.createLayergroup(mapConfig, mapParams, mapConfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
            if (err) {
                return next(err);
            }

            res.body = layergroup;
            res.locals.mapConfigProvider = mapConfigProvider;

            next();
        });
    };
}
