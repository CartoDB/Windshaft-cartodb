const cors = require('../middleware/cors');
const user = require('../middleware/user');
const vectorError = require('../middleware/vector-error');
const locals = require('../middleware/locals');
const cleanUpQueryParams = require('../middleware/clean-up-query-params');
const layergroupToken = require('../middleware/layergroup-token');
const credentials = require('../middleware/credentials');
const dbConnSetup = require('../middleware/db-conn-setup');
const authorize = require('../middleware/authorize');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const cacheChannelHeader = require('../middleware/cache-channel-header');
const surrogateKeyHeader = require('../middleware/surrogate-key-header');
const sendResponse = require('../middleware/send-response');
const DataviewBackend = require('../backends/dataview');
const AnalysisStatusBackend = require('../backends/analysis-status');
const MapStoreMapConfigProvider = require('../models/mapconfig/provider/map-store-provider');
const SUPPORTED_FORMATS = {
    grid_json: true,
    json_torque: true,
    torque_json: true,
    png: true,
    png32: true,
    mvt: true
};

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
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        incrementSuccessMetrics(global.statsClient),
        sendResponse(),
        incrementErrorMetrics(global.statsClient),
        tileError(),
        vectorError()
    );

    app.get(
        `${mapConfigBasePath}/:token/:z/:x/:y.:format`,
        cors(),
        cleanUpQueryParams(),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        incrementSuccessMetrics(global.statsClient),
        sendResponse(),
        incrementErrorMetrics(global.statsClient),
        tileError(),
        vectorError()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/:z/:x/:y.(:format)`,
        distinguishLayergroupFromStaticRoute(),
        cors(),
        cleanUpQueryParams(),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        incrementSuccessMetrics(global.statsClient),
        sendResponse(),
        incrementErrorMetrics(global.statsClient),
        tileError(),
        vectorError()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/attributes/:fid`,
        cors(),
        cleanUpQueryParams(),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    const forcedFormat = 'png';

    app.get(
        `${mapConfigBasePath}/static/center/:token/:z/:lat/:lng/:width/:height.:format`,
        cors(),
        cleanUpQueryParams(['layer']),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format`,
        cors(),
        cleanUpQueryParams(['layer']),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    // Undocumented/non-supported API endpoint methods.
    // Use at your own peril.

    const allowedDataviewQueryParams = [
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

    app.get(
        `${mapConfigBasePath}/:token/dataview/:dataviewName`,
        cors(),
        cleanUpQueryParams(allowedDataviewQueryParams),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/widget/:dataviewName`,
        cors(),
        cleanUpQueryParams(allowedDataviewQueryParams),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/dataview/:dataviewName/search`,
        cors(),
        cleanUpQueryParams(allowedDataviewQueryParams),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/:layer/widget/:dataviewName/search`,
        cors(),
        cleanUpQueryParams(allowedDataviewQueryParams),
        locals(),
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
        setCacheControlHeader(),
        setLastModifiedHeader(),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        sendResponse()
    );

    app.get(
        `${mapConfigBasePath}/:token/analysis/node/:nodeId`,
        cors(),
        cleanUpQueryParams(),
        locals(),
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
        analysisStatusBackend.getNodeStatus(res.locals, (err, nodeStatus, stats = {}) => {
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

function getRequestParams(locals) {
    const params = Object.assign({}, locals);

    delete params.mapConfigProvider;
    delete params.allowedQueryParams;

    return params;
}

function createMapStoreMapConfigProvider (
    mapStore,
    userLimitsApi,
    pgConnection,
    affectedTablesCache,
    forcedFormat = null
) {
    return function createMapStoreMapConfigProviderMiddleware (req, res, next) {
        const { user } = res.locals;

        const params = getRequestParams(res.locals);

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
        const params = getRequestParams(res.locals);

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
        const { user, dataviewName, mapConfigProvider } = res.locals;
        const params = getRequestParams(res.locals);

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
        const params = getRequestParams(res.locals);

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
    return tile.length === 0 && format === 'mvt'? 204 : 200;
}

function parseFormat (format = '') {
    const prettyFormat = format.replace('.', '_');
    return SUPPORTED_FORMATS[prettyFormat] ? prettyFormat : 'invalid';
}

function getTile (tileBackend, profileLabel = 'tile') {
    return function getTileMiddleware (req, res, next) {
        req.profiler.start(`windshaft.${profileLabel}`);

        const { mapConfigProvider } = res.locals;
        const params = getRequestParams(res.locals);

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

function setLastModifiedHeader () {
    return function setLastModifiedHeaderMiddleware (req, res, next) {
        let { cache_buster: cacheBuster } = res.locals;

        cacheBuster = parseInt(cacheBuster, 10);

        const lastUpdated = res.locals.cache_buster ? new Date(cacheBuster) : new Date();

        res.set('Last-Modified', lastUpdated.toUTCString());

        next();
    };
}

function setCacheControlHeader () {
    return function setCacheControlHeaderMiddleware (req, res, next) {
        res.set('Cache-Control', 'public,max-age=31536000');

        next();
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
