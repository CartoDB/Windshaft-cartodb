const cleanUpQueryParams = require('../../middleware/clean-up-query-params');
const credentials = require('../../middleware/credentials');
const dbConnSetup = require('../../middleware/db-conn-setup');
const authorize = require('../../middleware/authorize');
const namedMapProvider = require('./middlewares/named-map-provider');
const cacheControlHeader = require('../../middleware/cache-control-header');
const cacheChannelHeader = require('../../middleware/cache-channel-header');
const surrogateKeyHeader = require('../../middleware/surrogate-key-header');
const lastModifiedHeader = require('../../middleware/last-modified-header');
const vectorError = require('../../middleware/vector-error');
const rateLimit = require('../../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

function TileTemplateController (
    namedMapProviderCache,
    tileBackend,
    surrogateKeysCache,
    pgConnection,
    authApi,
    userLimitsApi
) {
    this.namedMapProviderCache = namedMapProviderCache;
    this.tileBackend = tileBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.pgConnection = pgConnection;
    this.authApi = authApi;
    this.userLimitsApi = userLimitsApi;
}

module.exports = TileTemplateController;

TileTemplateController.prototype.register = function (templateRouter) {
    templateRouter.get(
        `/:template_id/:layer/:z/:x/:y.(:format)`,
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_TILES),
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
    );
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

            res.body = tile;

            next();
        });
    };
}

function setContentTypeHeader () {
    return function setContentTypeHeaderMiddleware(req, res, next) {
        res.set('Content-Type', res.get('content-type') || res.get('Content-Type') || 'image/png');

        next();
    };
}
