var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');
var allowQueryParams = require('../middleware/allow-query-params');
var vectorError = require('../middleware/vector-error');

var DataviewBackend = require('../backends/dataview');
var AnalysisStatusBackend = require('../backends/analysis-status');

var MapStoreMapConfigProvider = require('../models/mapconfig/provider/map-store-provider');

var QueryTables = require('cartodb-query-tables');

/**
 * @param {AuthApi} authApi
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
function LayergroupController(prepareContext, pgConnection, mapStore, tileBackend, previewBackend, attributesBackend,
                              surrogateKeysCache, userLimitsApi, layergroupAffectedTables, analysisBackend) {
    this.pgConnection = pgConnection;
    this.mapStore = mapStore;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.attributesBackend = attributesBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTables = layergroupAffectedTables;

    this.dataviewBackend = new DataviewBackend(analysisBackend);
    this.analysisStatusBackend = new AnalysisStatusBackend();

    this.prepareContext = prepareContext;
}

module.exports = LayergroupController;

LayergroupController.prototype.register = function(app) {
    app.get(
        app.base_url_mapconfig + '/:token/:z/:x/:y@:scale_factor?x.:format',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.tile(this.tileBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse(),
        this.tileError(),
        vectorError()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:z/:x/:y.:format',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.tile(this.tileBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse(),
        this.tileError(),
        vectorError()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/:z/:x/:y.(:format)',
        cors(),
        userMiddleware,
        validateLayerRouteMiddleware,
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.layer(this.tileBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse(),
        this.tileError(),
        vectorError()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/attributes/:fid',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.attributes(this.attributesBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    const forcedFormat = 'png';

    app.get(
        app.base_url_mapconfig + '/static/center/:token/:z/:lat/:lng/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi, forcedFormat),
        this.center(this.previewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    app.get(
        app.base_url_mapconfig + '/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi, forcedFormat),
        this.bbox(this.previewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    // Undocumented/non-supported API endpoint methods.
    // Use at your own peril.

    var allowedDataviewQueryParams = [
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
        app.base_url_mapconfig + '/:token/dataview/:dataviewName',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.getDataview(this.dataviewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.getDataview(this.dataviewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    app.get(
        app.base_url_mapconfig + '/:token/dataview/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.dataviewSearch(this.dataviewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.dataviewSearch(this.dataviewBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );

    app.get(
        app.base_url_mapconfig + '/:token/analysis/node/:nodeId',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.analysisNodeStatus(this.analysisStatusBackend),
        this.setCacheControlHeader(),
        this.setLastModifiedHeader(),
        this.affectedTables(),
        this.sendResponse()
    );
};

function validateLayerRouteMiddleware(req, res, next) {
    if (req.params.token === 'static') {
        return next('route');
    }

    next();
}

LayergroupController.prototype.analysisNodeStatus = function (analysisStatusBackend) {
    return function analysisNodeStatusMiddleware(req, res, next) {
        analysisStatusBackend.getNodeStatus(res.locals, (err, nodeStatus, stats) => {
            req.profiler.add(stats || {});

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
    }.bind(this);
};

function getRequestParams(locals) {
    const params = Object.assign({}, locals);

    delete params.mapConfigProvider;
    delete params.allowedQueryParams;

    return params;
}

LayergroupController.prototype.getMapStoreMapConfigProvider = function (mapStore, userLimitsApi, forcedFormat = null) {
    return function getMapStoreMapConfigProviderMiddleware (req, res, next) {
        const { user } = res.locals;

        const params = getRequestParams(res.locals);

        if (forcedFormat) {
            params.format = forcedFormat;
            params.layer = params.layer || 'all';
        }

        res.locals.mapConfigProvider = new MapStoreMapConfigProvider(mapStore, user, userLimitsApi, params);

        next();
    };
};

LayergroupController.prototype.getDataview = function (dataviewBackend) {
    return function getDataviewMiddleware (req, res, next) {
        const { user, mapConfigProvider } = res.locals;

        dataviewBackend.getDataview(mapConfigProvider, user, res.locals, (err, dataview, stats) => {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET DATAVIEW';
                return next(err);
            }

            res.body = dataview;

            next();
        });
    }.bind(this);
};

LayergroupController.prototype.dataviewSearch = function (dataviewBackend) {
    return function dataviewSearchMiddlewarify (req, res, next) {
        const { user, dataviewName, mapConfigProvider } = res.locals;

        dataviewBackend.search(mapConfigProvider, user, dataviewName, res.locals, (err, searchResult, stats) => {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET DATAVIEW SEARCH';
                return next(err);
            }

            res.body = searchResult;

            next();
        });
    }.bind(this);
};

LayergroupController.prototype.attributes = function (attributesBackend) {
    return function attributesMiddleware (req, res, next) {
        req.profiler.start('windshaft.maplayer_attribute');

        const { mapConfigProvider } = res.locals;

        attributesBackend.getFeatureAttributes(mapConfigProvider, res.locals, false, (err, tile, stats) => {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET ATTRIBUTES';
                return next(err);
            }

            res.body = tile;

            next();
        });
    }.bind(this);
};

function getStatusCode(tile, format){
    return tile.length === 0 && format === 'mvt'? 204 : 200;
}

const supportedFormats = {
    grid_json: true,
    json_torque: true,
    torque_json: true,
    png: true,
    png32: true,
    mvt: true
};

function parseFormat (format = null) {
    const prettyFormat = format.replace('.', '_');
    let formatStat = 'invalid';

    if (supportedFormats[prettyFormat]) {
        formatStat = prettyFormat;
    }

    return formatStat;
}

LayergroupController.prototype.tile = function (tileBackend) {
    return function tileMiddleware (req, res, next) {
        req.profiler.start('windshaft.map_tile');

        const { mapConfigProvider } = res.locals;
        const params = getRequestParams(res.locals);

        tileBackend.getTile(mapConfigProvider, params, (err, tile, headers, stats) => {
            req.profiler.add(stats);

            const formatStat = parseFormat(req.params.format);

            if (err) {
                next(err);

                global.statsClient.increment('windshaft.tiles.error');
                global.statsClient.increment('windshaft.tiles.' + formatStat + '.error');

                return;
            }

            if (headers) {
                res.set(headers);
            }

            res.statusCode = getStatusCode(tile, formatStat);
            res.body = tile;

            next();

            global.statsClient.increment('windshaft.tiles.success');
            global.statsClient.increment('windshaft.tiles.' + formatStat + '.success');
        });
    }.bind(this);
};

LayergroupController.prototype.layer = function (tileBackend) {
    return function layerMiddleware (req, res, next) {
        req.profiler.start('windshaft.maplayer_tile');

        const { mapConfigProvider } = res.locals;
        const params = getRequestParams(res.locals);

        tileBackend.getTile(mapConfigProvider, params, (err, tile, headers, stats) => {
            req.profiler.add(stats);

            const formatStat = parseFormat(req.params.format);

            if (err) {
                next(err);

                global.statsClient.increment('windshaft.tiles.error');
                global.statsClient.increment('windshaft.tiles.' + formatStat + '.error');

                return;
            }

            if (headers) {
                res.set(headers);
            }

            res.statusCode = getStatusCode(tile, formatStat);
            res.body = tile;

            next();

            global.statsClient.increment('windshaft.tiles.success');
            global.statsClient.increment('windshaft.tiles.' + formatStat + '.success');
        });
    }.bind(this);
};

LayergroupController.prototype.tileError = function () {
    return function tileErrorMiddleware (err, req, res, next) {
        // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
        let errMsg = err.message ? ( '' + err.message ) : ( '' + err );

        // Rewrite mapnik parsing errors to start with layer number
        const matches = errMsg.match("(.*) in style 'layer([0-9]+)'");

        if (matches) {
            errMsg = 'style' + matches[2] + ': ' + matches[1];
        }

        err.message = errMsg;
        err.label = 'TILE RENDER';

        next(err);
    };
};

LayergroupController.prototype.center = function (previewBackend) {
    return function centerMiddleware (req, res, next) {
        const width = +req.params.width;
        const height = +req.params.height;
        const zoom = +req.params.z;
        const center = {
            lng: +req.params.lng,
            lat: +req.params.lat
        };

        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        const { mapConfigProvider } = res.locals;

        previewBackend.getImage(mapConfigProvider, format, width, height, zoom, center,(err, image, headers, stats) => {
            req.profiler.done('render-' + format);
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.set('Content-Type', headers['Content-Type'] || 'image/' + format);

            res.body = image;

            next();
        });
    }.bind(this);
};

LayergroupController.prototype.bbox = function (previewBackend) {
    return function bboxMiddleware (req, res, next) {
        const width = +req.params.width;
        const height = +req.params.height;
        const bounds = {
            west: +req.params.west,
            north: +req.params.north,
            east: +req.params.east,
            south: +req.params.south
        };
        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        const { mapConfigProvider } = res.locals;

        previewBackend.getImage(mapConfigProvider, format, width, height, bounds, (err, image, headers, stats) => {
            req.profiler.done('render-' + format);
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'STATIC_MAP';
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.set('Content-Type', headers['Content-Type'] || 'image/' + format);

            res.body = image;

            next();
        });
    }.bind(this);
};

LayergroupController.prototype.setLastModifiedHeader = function () {
    return function setLastModifiedHeaderMiddleware (req, res, next) {
        let { cache_buster: cacheBuster } = res.locals;

        cacheBuster = parseInt(cacheBuster);

        const lastUpdated = res.locals.cache_buster ? new Date(cacheBuster) : new Date();

        res.set('Last-Modified', lastUpdated.toUTCString());

        next();
    };
};

LayergroupController.prototype.setCacheControlHeader = function () {
    return function setCacheControlHeaderMiddleware (req, res, next) {
        if (!res.get('Cache-Control')) {
            res.set('Cache-Control', 'public,max-age=31536000');
        }

        next();
    };
};

LayergroupController.prototype.affectedTables = function () {
    return function affectedTablesMiddleware (req, res, next) {
        const { user, dbname, token } = res.locals;

        this.getAffectedTables(user, dbname, token, (err, affectedTables) => {
            req.profiler.done('affectedTables');

            if (err) {
                global.logger.warn('ERROR generating cache channel: ' + err);
            }

            if (!!affectedTables) {
                res.set('X-Cache-Channel', affectedTables.getCacheChannel());
                this.surrogateKeysCache.tag(res, affectedTables);
            }

            next();
        });
    }.bind(this);
};

LayergroupController.prototype.getAffectedTables = function (user, dbName, layergroupId, callback) {
    if (this.layergroupAffectedTables.hasAffectedTables(dbName, layergroupId)) {
        return callback(null, this.layergroupAffectedTables.get(dbName, layergroupId));
    }

    this.mapStore.load(layergroupId, (err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        var queries = [];
        mapConfig.getLayers().forEach(function(layer) {
            queries.push(layer.options.sql);
            if (layer.options.affected_tables) {
                layer.options.affected_tables.map(function(table) {
                    queries.push('SELECT * FROM ' + table + ' LIMIT 0');
                });
            }
        });

        const sql = queries.length ? queries.join(';') : null;

        if ( ! sql ) {
            return callback(new Error("this request doesn't need an X-Cache-Channel generated"));
        }

        this.pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return callback(err);
            }

            QueryTables.getAffectedTablesFromQuery(connection, sql, (err, tables) => {
                if (err) {
                    return callback(err);
                }

                // feed affected tables cache so it can be reused from, for instance, map controller
                this.layergroupAffectedTables.set(dbName, layergroupId, tables);

                callback(null, tables);
            });
        });
    });
};

LayergroupController.prototype.sendResponse = function () {
    return function sendResponseMiddleware (req, res) {
        req.profiler.done('res');

        res.status(res.statusCode || 200);

        if (!Buffer.isBuffer(res.body) && typeof res.body === 'object') {
            if (req.query && req.query.callback) {
                res.jsonp(res.body);
            } else {
                res.json(res.body);
            }
        } else {
            res.send(res.body);
        }
    };
};
