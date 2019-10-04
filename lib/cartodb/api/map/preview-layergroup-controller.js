'use strict';

const layergroupToken = require('../middlewares/layergroup-token');
const coordinates = require('../middlewares/coordinates');
const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const noop = require('../middlewares/noop');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const createMapStoreMapConfigProvider = require('../middlewares/map-store-map-config-provider');
const cacheControlHeader = require('../middlewares/cache-control-header');
const cacheChannelHeader = require('../middlewares/cache-channel-header');
const surrogateKeyHeader = require('../middlewares/surrogate-key-header');
const lastModifiedHeader = require('../middlewares/last-modified-header');
const checkStaticImageFormat = require('../middlewares/check-static-image-format');

module.exports = class PreviewLayergroupController {
    constructor (
        previewBackend,
        pgConnection,
        mapStore,
        userLimitsBackend,
        layergroupAffectedTablesCache,
        authBackend,
        surrogateKeysCache
    ) {
        this.previewBackend = previewBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsBackend = userLimitsBackend;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authBackend = authBackend;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    route (mapRouter) {
        mapRouter.get('/static/center/:token/:z/:lat/:lng/:width/:height.:format', this.middlewares({
            validateZoom: true,
            previewType: 'centered'
        }));

        mapRouter.get('/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format', this.middlewares({
            validateZoom: false,
            previewType: 'bbox'
        }));
    }

    middlewares ({ validateZoom, previewType }) {
        const forcedFormat = 'png';

        let getPreviewImage;

        if (previewType === 'centered') {
            getPreviewImage = getPreviewImageByCenter;
        }

        if (previewType === 'bbox') {
            getPreviewImage = getPreviewImageByBoundingBox;
        }

        return [
            layergroupToken(),
            validateZoom ? coordinates({ z: true, x: false, y: false }) : noop(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC),
            cleanUpQueryParams(['layer']),
            checkStaticImageFormat(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsBackend,
                this.pgConnection,
                this.layergroupAffectedTablesCache,
                forcedFormat
            ),
            getPreviewImage(this.previewBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        ];
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
        const { mapConfigProvider } = res.locals;
        const options = { mapConfigProvider, format, width, height, zoom, center };

        previewBackend.getImage(options, (err, image, stats = {}) => {
            req.profiler.done(`render-${format}`);
            req.profiler.add(stats);

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            res.set('Content-Type', `image/${format}`);

            res.statusCode = 200;
            res.body = image;

            next();
        });
    };
}

function getPreviewImageByBoundingBox (previewBackend) {
    return function getPreviewImageByBoundingBoxMiddleware (req, res, next) {
        const width = +req.params.width;
        const height = +req.params.height;
        const bbox = {
            west: +req.params.west,
            north: +req.params.north,
            east: +req.params.east,
            south: +req.params.south
        };
        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        const { mapConfigProvider } = res.locals;
        const options = { mapConfigProvider, format, width, height, bbox };

        previewBackend.getImage(options, (err, image, stats = {}) => {
            req.profiler.done(`render-${format}`);
            req.profiler.add(stats);

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            res.set('Content-Type', `image/${format}`);

            res.statusCode = 200;
            res.body = image;

            next();
        });
    };
}
