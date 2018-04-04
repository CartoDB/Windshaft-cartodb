const layergroupToken = require('../../middleware/layergroup-token');
const cleanUpQueryParams = require('../../middleware/clean-up-query-params');
const credentials = require('../../middleware/credentials');
const dbConnSetup = require('../../middleware/db-conn-setup');
const authorize = require('../../middleware/authorize');
const rateLimit = require('../../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const createMapStoreMapConfigProvider = require('./middlewares/map-store-map-config-provider');
const cacheControlHeader = require('../../middleware/cache-control-header');
const cacheChannelHeader = require('../../middleware/cache-channel-header');
const surrogateKeyHeader = require('../../middleware/surrogate-key-header');
const lastModifiedHeader = require('../../middleware/last-modified-header');

const ALLOWED_DATAVIEW_QUERY_PARAMS = [
    'filters', // json
    'own_filter', // 0, 1
    'no_filters', // 0, 1
    'bbox', // w,s,e,n
    'start', // number
    'end', // number
    'column_type', // string
    'bins', // number
    'aggregation', //string
    'offset', // number
    'q', // widgets search
    'categories', // number
];

module.exports = class DataviewLayergroupController {
    constructor (
        dataviewBackend,
        pgConnection,
        mapStore,
        userLimitsApi,
        layergroupAffectedTablesCache,
        authApi,
        surrogateKeysCache
    ) {
        this.dataviewBackend = dataviewBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authApi = authApi;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    register (mapRouter) {
        // Undocumented/non-supported API endpoint methods.
        // Use at your own peril.

        mapRouter.get(
            `/:token/dataview/:dataviewName`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW),
            cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getDataview(this.dataviewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        );

        mapRouter.get(
            `/:token/:layer/widget/:dataviewName`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW),
            cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getDataview(this.dataviewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        );

        mapRouter.get(
            `/:token/dataview/:dataviewName/search`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH),
            cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            dataviewSearch(this.dataviewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        );

        mapRouter.get(
            `/:token/:layer/widget/:dataviewName/search`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH),
            cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            dataviewSearch(this.dataviewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        );
    }
};

function getDataview (dataviewBackend) {
    return function getDataviewMiddleware (req, res, next) {
        const { user, mapConfigProvider } = res.locals;
        const { dataviewName } = req.params;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;

        const params = Object.assign({ dataviewName, dbuser, dbname, dbpassword, dbhost, dbport }, req.query);

        dataviewBackend.getDataview(mapConfigProvider, user, params, (err, dataview, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET DATAVIEW';
                return next(err);
            }

            res.body = dataview;

            next();
        });
    };
}

function dataviewSearch (dataviewBackend) {
    return function dataviewSearchMiddleware (req, res, next) {
        const { user, mapConfigProvider } = res.locals;
        const { dataviewName } = req.params;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;

        const params = Object.assign({ dbuser, dbname, dbpassword, dbhost, dbport }, req.query);

        dataviewBackend.search(mapConfigProvider, user, dataviewName, params, (err, searchResult, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET DATAVIEW SEARCH';
                return next(err);
            }

            res.body = searchResult;

            next();
        });
    };
}
