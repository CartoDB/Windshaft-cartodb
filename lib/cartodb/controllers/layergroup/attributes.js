const cors = require('../../middleware/cors');
const user = require('../../middleware/user');
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

module.exports = class AttribitesController {
    constructor (
        attributesBackend,
        pgConnection,
        mapStore,
        userLimitsApi,
        layergroupAffectedTablesCache,
        authApi,
        surrogateKeysCache
    ) {
        this.attributesBackend = attributesBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authApi = authApi;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    register (app) {
        const { base_url_mapconfig: mapConfigBasePath } = app;

        app.get(
            `${mapConfigBasePath}/:token/:layer/attributes/:fid`,
            cors(),
            user(),
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ATTRIBUTES),
            cleanUpQueryParams(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getFeatureAttributes(this.attributesBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader(),
            sendResponse()
        );
    }
};

function getFeatureAttributes (attributesBackend) {
    return function getFeatureAttributesMiddleware (req, res, next) {
        req.profiler.start('windshaft.maplayer_attribute');

        const { mapConfigProvider } = res.locals;
        const { token } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { layer, fid } = req.params;

        const params = {
            token,
            dbuser, dbname, dbpassword, dbhost, dbport,
            layer, fid
        };

        attributesBackend.getFeatureAttributes(mapConfigProvider, params, false, (err, tile, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET ATTRIBUTES';
                return next(err);
            }

            res.body = tile;

            next();
        });
    };
}
