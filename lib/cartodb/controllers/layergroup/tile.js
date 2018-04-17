const layergroupToken = require('../../middleware/layergroup-token');
const coordinates = require('../../middleware/coordinates');
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
const sendResponse = require('../../middleware/send-response');
const vectorError = require('../../middleware/vector-error');

const SUPPORTED_FORMATS = {
    grid_json: true,
    json_torque: true,
    torque_json: true,
    png: true,
    png32: true,
    mvt: true
};

module.exports = class TileLayergroupController {
    constructor (
        tileBackend,
        pgConnection,
        mapStore,
        userLimitsApi,
        layergroupAffectedTablesCache,
        authApi,
        surrogateKeysCache
    ) {
        this.tileBackend = tileBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authApi = authApi;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    register (mapRouter) {
        mapRouter.get(
            `/:token/:z/:x/:y@:scale_factor?x.:format`,
            layergroupToken(),
            coordinates(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
            cleanUpQueryParams(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getTile(this.tileBackend, 'map_tile'),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            incrementSuccessMetrics(global.statsClient),
            incrementErrorMetrics(global.statsClient),
            tileError(),
            vectorError(),
            sendResponse()
        );

        mapRouter.get(
            `/:token/:z/:x/:y.:format`,
            layergroupToken(),
            coordinates(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
            cleanUpQueryParams(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getTile(this.tileBackend, 'map_tile'),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            incrementSuccessMetrics(global.statsClient),
            incrementErrorMetrics(global.statsClient),
            tileError(),
            vectorError(),
            sendResponse()
        );

        mapRouter.get(
            `/:token/:layer/:z/:x/:y.(:format)`,
            distinguishLayergroupFromStaticRoute(),
            layergroupToken(),
            coordinates(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
            cleanUpQueryParams(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getTile(this.tileBackend, 'maplayer_tile'),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            incrementSuccessMetrics(global.statsClient),
            incrementErrorMetrics(global.statsClient),
            tileError(),
            vectorError(),
            sendResponse()
        );
    }
};

function distinguishLayergroupFromStaticRoute () {
    return function distinguishLayergroupFromStaticRouteMiddleware(req, res, next) {
        if (req.params.token === 'static') {
            return next('route');
        }

        next();
    };
}

function parseFormat (format = '') {
    const prettyFormat = format.replace('.', '_');
    return SUPPORTED_FORMATS[prettyFormat] ? prettyFormat : 'invalid';
}

function getStatusCode(tile, format){
    return tile.length === 0 && format === 'mvt' ? 204 : 200;
}

function getTile (tileBackend, profileLabel = 'tile') {
    return function getTileMiddleware (req, res, next) {
        req.profiler.start(`windshaft.${profileLabel}`);

        const { mapConfigProvider } = res.locals;
        const { token } = res.locals;
        const { layer, z, x, y, format } = req.params;

        const params = { token, layer, z, x, y, format };

        tileBackend.getTile(mapConfigProvider, params, (err, tile, headers, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            const formatStat = parseFormat(req.params.format);

            res.statusCode = getStatusCode(tile, formatStat);
            res.body = tile;

            next();
        });
    };
}

function incrementSuccessMetrics (statsClient) {
    return function incrementSuccessMetricsMiddleware (req, res, next) {
        const formatStat = parseFormat(req.params.format);

        statsClient.increment('windshaft.tiles.success');
        statsClient.increment(`windshaft.tiles.${formatStat}.success`);

        next();
    };
}

function incrementErrorMetrics (statsClient) {
    return function incrementErrorMetricsMiddleware (err, req, res, next) {
        const formatStat = parseFormat(req.params.format);

        statsClient.increment('windshaft.tiles.error');
        statsClient.increment(`windshaft.tiles.${formatStat}.error`);

        next(err);
    };
}

function tileError () {
    return function tileErrorMiddleware (err, req, res, next) {
        if (err.message === 'Tile does not exist' && req.params.format === 'mvt') {
            res.statusCode = 204;
            return next();
        }

        // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
        let errMsg = err.message ? ( '' + err.message ) : ( '' + err );

        // Rewrite mapnik parsing errors to start with layer number
        const matches = errMsg.match("(.*) in style 'layer([0-9]+)'");

        if (matches) {
            errMsg = `style${matches[2]}: ${matches[1]}`;
        }

        err.message = errMsg;
        err.label = 'TILE RENDER';

        next(err);
    };
}
