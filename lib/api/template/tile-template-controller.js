'use strict';

const coordinates = require('../middlewares/coordinates');
const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const namedMapProvider = require('../middlewares/named-map-provider');
const cacheControlHeader = require('../middlewares/cache-control-header');
const cacheChannelHeader = require('../middlewares/cache-channel-header');
const surrogateKeyHeader = require('../middlewares/surrogate-key-header');
const lastModifiedHeader = require('../middlewares/last-modified-header');
const vectorError = require('../middlewares/vector-error');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

module.exports = class TileTemplateController {
    constructor (
        namedMapProviderCache,
        tileBackend,
        surrogateKeysCache,
        pgConnection,
        authBackend,
        userLimitsBackend
    ) {
        this.namedMapProviderCache = namedMapProviderCache;
        this.tileBackend = tileBackend;
        this.surrogateKeysCache = surrogateKeysCache;
        this.pgConnection = pgConnection;
        this.authBackend = authBackend;
        this.userLimitsBackend = userLimitsBackend;
    }

    route (templateRouter) {
        templateRouter.get('/:template_id/:layer/:z/:x/:y.(:format)', this.middlewares());
    }

    middlewares () {
        return [
            coordinates(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_TILES),
            cleanUpQueryParams(),
            namedMapProvider({
                namedMapProviderCache: this.namedMapProviderCache,
                label: 'NAMED_MAP_TILE'
            }),
            getTile({
                tileBackend: this.tileBackend,
                label: 'NAMED_MAP_TILE'
            }),
            setContentTypeHeader(),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            vectorError()
        ];
    }
};

function getTile ({ tileBackend, label }) {
    return function getTileMiddleware (req, res, next) {
        const { mapConfigProvider } = res.locals;
        const { layer, z, x, y, format } = req.params;
        const params = { layer, z, x, y, format };

        tileBackend.getTile(mapConfigProvider, params, (err, tile, headers, stats) => {
            req.profiler.add(stats);
            req.profiler.done('render-' + format);

            if (err) {
                err.label = label;
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.statusCode = 200;
            res.body = tile;

            next();
        });
    };
}

function setContentTypeHeader () {
    return function setContentTypeHeaderMiddleware (req, res, next) {
        res.set('Content-Type', res.get('content-type') || res.get('Content-Type') || 'image/png');

        next();
    };
}
