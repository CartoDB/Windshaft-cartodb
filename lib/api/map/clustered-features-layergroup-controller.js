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

module.exports = class AggregatedFeaturesLayergroupController {
    constructor (
        clusterBackend,
        pgConnection,
        mapStore,
        userLimitsBackend,
        layergroupAffectedTablesCache,
        authBackend,
        surrogateKeysCache
    ) {
        this.clusterBackend = clusterBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsBackend = userLimitsBackend;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authBackend = authBackend;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    route (mapRouter) {
        mapRouter.get('/:token/:layer/:z/cluster/:clusterId', this.middlewares());
    }

    middlewares () {
        return [
            layergroupToken(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            // TODO: create its rate limit
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ATTRIBUTES),
            cleanUpQueryParams(['aggregation']),
            createMapStoreMapConfigProvider(
                this.mapStore,
                this.userLimitsBackend,
                this.pgConnection,
                this.layergroupAffectedTablesCache
            ),
            getClusteredFeatures(this.clusterBackend),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        ];
    }
};

function getClusteredFeatures (clusterBackend) {
    return function getFeatureAttributesMiddleware (req, res, next) {
        req.profiler.start('windshaft.maplayer_cluster_features');

        const { mapConfigProvider } = res.locals;
        const { user, token } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { layer, z: zoom, clusterId } = req.params;
        const { aggregation } = req.query;

        const params = {
            user,
            token,
            dbuser,
            dbname,
            dbpassword,
            dbhost,
            dbport,
            layer,
            zoom,
            clusterId,
            aggregation
        };

        clusterBackend.getClusterFeatures(mapConfigProvider, params, (err, features, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET CLUSTERED FEATURES';
                return next(err);
            }

            res.statusCode = 200;
            const { rows, fields } = features;
            res.body = { rows, fields };

            next();
        });
    };
}
