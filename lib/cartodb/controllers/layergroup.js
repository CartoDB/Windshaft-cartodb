const cors = require('../middleware/cors');
const user = require('../middleware/user');
const vectorError = require('../middleware/vector-error');
const cleanUpQueryParams = require('../middleware/clean-up-query-params');
const layergroupToken = require('../middleware/layergroup-token');
const credentials = require('../middleware/credentials');
const dbConnSetup = require('../middleware/db-conn-setup');
const authorize = require('../middleware/authorize');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const cacheControlHeader = require('../middleware/cache-control-header');
const cacheChannelHeader = require('../middleware/cache-channel-header');
const surrogateKeyHeader = require('../middleware/surrogate-key-header');
const lastModifiedHeader = require('../middleware/last-modified-header');
const sendResponse = require('../middleware/send-response');
const DataviewBackend = require('../backends/dataview');
const AnalysisStatusBackend = require('../backends/analysis-status');
const MapStoreMapConfigProvider = require('../models/mapconfig/provider/map-store-provider');
const dbParamsFromResLocals = require('../utils/database-params');

const SUPPORTED_FORMATS = {
    grid_json: true,
    json_torque: true,
    torque_json: true,
    png: true,
    png32: true,
    mvt: true
};

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

/**
 * @param {prepareContext} prepareContext
 * @param {PgConnection} pgConnection
 * @param {MapStore} mapStore
 * @param {TileBackend} tileBackend
 * @param {PreviewBackend} previewBackend
 * @param {AttributesBackend} attributesBackend
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @param {AnalysisBackend} analysisBackend
 * @constructor
 */
function LayergroupController(
    pgConnection,
    mapStore,
    tileBackend,
    previewBackend,
    attributesBackend,
    surrogateKeysCache,
    userLimitsApi,
    layergroupAffectedTablesCache,
    analysisBackend,
    authApi
) {
    this.pgConnection = pgConnection;
    this.mapStore = mapStore;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.attributesBackend = attributesBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;

    this.dataviewBackend = new DataviewBackend(analysisBackend);
    this.analysisStatusBackend = new AnalysisStatusBackend();
    this.authApi = authApi;
}

module.exports = LayergroupController;

LayergroupController.prototype.register = function(app) {
    const { base_url_mapconfig: mapConfigBasePath } = app;

    app.get(
        `${mapConfigBasePath}/:token/:z/:x/:y@:scale_factor?x.:format`,
        cors(),
        cleanUpQueryParams(),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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

    app.get(
        `${mapConfigBasePath}/:token/:z/:x/:y.:format`,
        cors(),
        cleanUpQueryParams(),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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

    app.get(
        `${mapConfigBasePath}/:token/:layer/:z/:x/:y.(:format)`,
        distinguishLayergroupFromStaticRoute(),
        cors(),
        cleanUpQueryParams(),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.TILE),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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

    app.get(
        `${mapConfigBasePath}/:token/:layer/attributes/:fid`,
        cors(),
        cleanUpQueryParams(),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ATTRIBUTES),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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

    const forcedFormat = 'png';

    app.get(
        `${mapConfigBasePath}/static/center/:token/:z/:lat/:lng/:width/:height.:format`,
        cors(),
        cleanUpQueryParams(['layer']),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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
        cors(),
        cleanUpQueryParams(['layer']),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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

    // Undocumented/non-supported API endpoint methods.
    // Use at your own peril.

    app.get(
        `${mapConfigBasePath}/:token/dataview/:dataviewName`,
        cors(),
        cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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
        lastModifiedHeader(),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/widget/:dataviewName`,
        cors(),
        cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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
        lastModifiedHeader(),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/dataview/:dataviewName/search`,
        cors(),
        cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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
        lastModifiedHeader(),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/widget/:dataviewName/search`,
        cors(),
        cleanUpQueryParams(ALLOWED_DATAVIEW_QUERY_PARAMS),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.DATAVIEW_SEARCH),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
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
        lastModifiedHeader(),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/analysis/node/:nodeId`,
        cors(),
        cleanUpQueryParams(),
        user(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ANALYSIS),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        analysisNodeStatus(this.analysisStatusBackend),
        sendResponse()
    );
};

function distinguishLayergroupFromStaticRoute () {
    return function distinguishLayergroupFromStaticRouteMiddleware(req, res, next) {
        if (req.params.token === 'static') {
            return next('route');
        }

        next();
    };
}

function analysisNodeStatus (analysisStatusBackend) {
    return function analysisNodeStatusMiddleware(req, res, next) {
        const { nodeId } = req.params;
        const dbParams = dbParamsFromResLocals(res.locals);

        analysisStatusBackend.getNodeStatus(nodeId, dbParams, (err, nodeStatus, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET NODE STATUS';
                return next(err);
            }

            res.set({
                'Cache-Control': 'public,max-age=5',
                'Last-Modified': new Date().toUTCString()
            });

            res.body = nodeStatus;

            next();
        });
    };
}

function createMapStoreMapConfigProvider (
    mapStore,
    userLimitsApi,
    pgConnection,
    affectedTablesCache,
    forcedFormat = null
) {
    return function createMapStoreMapConfigProviderMiddleware (req, res, next) {
        const { user, token, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { layer, z, x, y, scale_factor, format } = req.params;

        const params = {
            user, token, cache_buster, api_key,
            dbuser, dbname, dbpassword, dbhost, dbport,
            layer, z, x, y, scale_factor, format
        };

        if (forcedFormat) {
            params.format = forcedFormat;
            params.layer = params.layer || 'all';
        }

        res.locals.mapConfigProvider = new MapStoreMapConfigProvider(
            mapStore,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            params
        );

        next();
    };
}

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

function getStatusCode(tile, format){
    return tile.length === 0 && format === 'mvt' ? 204 : 200;
}

function parseFormat (format = '') {
    const prettyFormat = format.replace('.', '_');
    return SUPPORTED_FORMATS[prettyFormat] ? prettyFormat : 'invalid';
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
