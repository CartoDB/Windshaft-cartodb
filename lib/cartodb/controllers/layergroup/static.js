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
const sendResponse = require('../../middleware/send-response');

module.exports = class StaticController {
    constructor (
        previewBackend,
        pgConnection,
        mapStore,
        userLimitsApi,
        layergroupAffectedTablesCache,
        authApi,
        surrogateKeysCache
    ) {
        this.previewBackend = previewBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authApi = authApi;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    register (app) {
        const { base_url_mapconfig: mapConfigBasePath } = app;

        const forcedFormat = 'png';

        app.get(
            `${mapConfigBasePath}/static/center/:token/:z/:lat/:lng/:width/:height.:format`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC),
            cleanUpQueryParams(['layer']),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache,
                forcedFormat
            ),
            getPreviewImageByCenter(this.previewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            sendResponse()
        );

        app.get(
            `${mapConfigBasePath}/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format`,
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC),
            cleanUpQueryParams(['layer']),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache,
                forcedFormat
            ),
            getPreviewImageByBoundingBox(this.previewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            sendResponse()
        );
    }
};

function getPreviewImageByCenter (previewBackend) {
    return function getPreviewImageByCenterMiddleware (req, res, next) {
        const width = +req.params.width;
        const height = +req.params.height;
        const zoom = +req.params.z;
        const center = {
            lng: +req.params.lng,
            lat: +req.params.lat
        };

        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        const { mapConfigProvider: provider } = res.locals;

        previewBackend.getImage(provider, format, width, height, zoom, center, (err, image, headers, stats = {}) => {
            req.profiler.done(`render-${format}`);
            req.profiler.add(stats);

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.set('Content-Type', headers['Content-Type'] || `image/${format}`);

            res.body = image;

            next();
        });
    };
}

function getPreviewImageByBoundingBox (previewBackend) {
    return function getPreviewImageByBoundingBoxMiddleware (req, res, next) {
        const width = +req.params.width;
        const height = +req.params.height;
        const bounds = {
            west: +req.params.west,
            north: +req.params.north,
            east: +req.params.east,
            south: +req.params.south
        };
        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        const { mapConfigProvider: provider } = res.locals;

        previewBackend.getImage(provider, format, width, height, bounds, (err, image, headers, stats = {}) => {
            req.profiler.done(`render-${format}`);
            req.profiler.add(stats);

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.set('Content-Type', headers['Content-Type'] || `image/${format}`);

            res.body = image;

            next();
        });
    };
}
