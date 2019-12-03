'use strict';

const layergroupToken = require('../middlewares/layergroup-token');
const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const createMapStoreMapConfigProvider = require('../middlewares/map-store-map-config-provider');
const cacheControlHeader = require('../middlewares/cache-control-header');
const cacheChannelHeader = require('../middlewares/cache-channel-header');
const surrogateKeyHeader = require('../middlewares/surrogate-key-header');
const lastModifiedHeader = require('../middlewares/last-modified-header');

const ALLOWED_DATAVIEW_QUERY_PARAMS = [
    'filters', // json
    'own_filter', // 0, 1
    'no_filters', // 0, 1
    'bbox', // w,s,e,n
    'circle', // json
    'polygon', // json
    'start', // number
    'end', // number
    'column_type', // string
    'bins', // number
    'aggregation', // string
    'offset', // number
    'q', // widgets search
    'categories' // number
];

module.exports = class DataviewLayergroupController {
    constructor (
        dataviewBackend,
        pgConnection,
        mapStore,
        userLimitsBackend,
        layergroupAffectedTablesCache,
        authBackend,
        surrogateKeysCache
    ) {
        this.dataviewBackend = dataviewBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsBackend = userLimitsBackend;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authBackend = authBackend;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    route (mapRouter) {
        // Undocumented/non-supported API endpoint methods.
        // Use at your own peril.

        mapRouter.get('/:token/dataview/:dataviewName', this.middlewares({
            action: 'get',
            rateLimitGroup: RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW
        }));

        mapRouter.get('/:token/:layer/widget/:dataviewName', this.middlewares({
            action: 'get',
            rateLimitGroup: RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW
        }));

        mapRouter.get('/:token/dataview/:dataviewName/search', this.middlewares({
            action: 'search',
            rateLimitGroup: RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH
        }));

        mapRouter.get('/:token/:layer/widget/:dataviewName/search', this.middlewares({
            action: 'search',
            rateLimitGroup: RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH
        }));
    }

    middlewares ({ action, rateLimitGroup }) {
        return [
            layergroupToken(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, rateLimitGroup),
            cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsBackend,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            action === 'search' ? dataviewSearch(this.dataviewBackend) : getDataview(this.dataviewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        ];
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

            res.statusCode = 200;
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

            res.statusCode = 200;
            res.body = searchResult;

            next();
        });
    };
}
