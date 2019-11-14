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

module.exports = class AttributesLayergroupController {
    constructor (
        attributesBackend,
        pgConnection,
        mapStore,
        userLimitsBackend,
        layergroupAffectedTablesCache,
        authBackend,
        surrogateKeysCache
    ) {
        this.attributesBackend = attributesBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsBackend = userLimitsBackend;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authBackend = authBackend;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    route (mapRouter) {
        mapRouter.get('/:token/:layer/attributes/:fid', this.middlewares());
    }

    middlewares () {
        return [
            layergroupToken(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ATTRIBUTES),
            cleanUpQueryParams(),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsBackend,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getFeatureAttributes(this.attributesBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        ];
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
            dbuser,
            dbname,
            dbpassword,
            dbhost,
            dbport,
            layer,
            fid
        };

        attributesBackend.getFeatureAttributes(mapConfigProvider, params, false, (err, tile, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET ATTRIBUTES';
                return next(err);
            }

            res.statusCode = 200;
            res.body = tile;

            next();
        });
    };
}
