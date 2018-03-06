var assert = require('assert');
var step = require('step');

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
        this.tileError(),
        vectorError()
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/attributes/:fid',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.attributes(this.attributesBackend)
    );

    const forcedFormat = 'png';

    app.get(
        app.base_url_mapconfig + '/static/center/:token/:z/:lat/:lng/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi, forcedFormat),
        this.center(this.previewBackend)
    );

    app.get(
        app.base_url_mapconfig + '/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi, forcedFormat),
        this.bbox(this.previewBackend)
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
        this.getDataview(this.dataviewBackend)
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.getDataview(this.dataviewBackend)
    );

    app.get(
        app.base_url_mapconfig + '/:token/dataview/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.dataviewSearch(this.dataviewBackend)
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.prepareContext,
        this.getMapStoreMapConfigProvider(this.mapStore, this.userLimitsApi),
        this.dataviewSearch(this.dataviewBackend)
    );

    app.get(
        app.base_url_mapconfig + '/:token/analysis/node/:nodeId',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.analysisNodeStatus(this.analysisStatusBackend)
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

            this.sendResponse(req, res, nodeStatus, 200, {
                'Cache-Control': 'public,max-age=5',
                'Last-Modified': new Date().toUTCString()
            });
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

            this.sendResponse(req, res, dataview, 200);
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

            this.sendResponse(req, res, searchResult, 200);
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

            this.sendResponse(req, res, tile, 200);
        });
    }.bind(this);
};

function getStatusCode(tile, format){
    return tile.length===0 && format==='mvt'? 204:200;
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

            this.sendResponse(req, res, tile, getStatusCode(tile, formatStat), headers);

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

            this.sendResponse(req, res, tile, getStatusCode(tile, formatStat), headers);
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

            res.set('Content-Type', headers['Content-Type'] || 'image/' + format);
            this.sendResponse(req, res, image, 200);
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

            res.set('Content-Type', headers['Content-Type'] || 'image/' + format);

            this.sendResponse(req, res, image, 200);
        });
    }.bind(this);
};

LayergroupController.prototype.sendResponse = function(req, res, body, status, headers) {
    req.profiler.done('res');

    res.set('Cache-Control', 'public,max-age=31536000');

    // Set Last-Modified header
    var lastUpdated;
    if (res.locals.cache_buster) {
        // Assuming cache_buster is a timestamp
        lastUpdated = new Date(parseInt(res.locals.cache_buster));
    } else {
        lastUpdated = new Date();
    }
    res.set('Last-Modified', lastUpdated.toUTCString());

    var dbName = res.locals.dbname;

    this.getAffectedTables(res.locals.user, dbName, res.locals.token, (err, affectedTables) => {
        req.profiler.done('affectedTables');

        if (err) {
            global.logger.warn('ERROR generating cache channel: ' + err);
        }
        if (!!affectedTables) {
            res.set('X-Cache-Channel', affectedTables.getCacheChannel());
            this.surrogateKeysCache.tag(res, affectedTables);
        }

        if (headers) {
            res.set(headers);
        }

        res.status(status);

        if (!Buffer.isBuffer(body) && typeof body === 'object') {
            if (req.query && req.query.callback) {
                res.jsonp(body);
            } else {
                res.json(body);
            }
        } else {
            res.send(body);
        }
    });
};

LayergroupController.prototype.getAffectedTables = function(user, dbName, layergroupId, callback) {

    if (this.layergroupAffectedTables.hasAffectedTables(dbName, layergroupId)) {
        return callback(null, this.layergroupAffectedTables.get(dbName, layergroupId));
    }

    var self = this;

    step(
        function loadFromStore() {
            self.mapStore.load(layergroupId, this);
        },
        function getSQL(err, mapConfig) {
            assert.ifError(err);

            var queries = [];
            mapConfig.getLayers().forEach(function(layer) {
                queries.push(layer.options.sql);
                if (layer.options.affected_tables) {
                    layer.options.affected_tables.map(function(table) {
                        queries.push('SELECT * FROM ' + table + ' LIMIT 0');
                    });
                }
            });

            return queries.length ? queries.join(';') : null;
        },
        function getConnection(err, sql) {
            assert.ifError(err);

            if ( ! sql ) {
                throw new Error("this request doesn't need an X-Cache-Channel generated");
            }

            const next = this;

            self.pgConnection.getConnection(user, function (err, connection) {
                if (err) {
                    return next();
                }

                next(null, connection, sql);
            });
        },
        function getAffectedTables(err, connection, sql) {
            assert.ifError(err);

            QueryTables.getAffectedTablesFromQuery(connection, sql, this);
        },
        function buildCacheChannel(err, tables) {
            assert.ifError(err);
            self.layergroupAffectedTables.set(dbName, layergroupId, tables);

            return tables;
        },
        callback
    );
};
