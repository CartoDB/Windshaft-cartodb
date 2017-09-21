var assert = require('assert');
var step = require('step');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');
var allowQueryParams = require('../middleware/allow-query-params');

var DataviewBackend = require('../backends/dataview');
var AnalysisStatusBackend = require('../backends/analysis-status');

var MapStoreMapConfigProvider = require('../models/mapconfig/provider/map-store-provider');

var QueryTables = require('cartodb-query-tables');

const req2paramsMiddleware = require('../middleware/req2params-middleware');

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
function LayergroupController(authApi, pgConnection, mapStore, tileBackend, previewBackend, attributesBackend,
                              surrogateKeysCache, userLimitsApi, layergroupAffectedTables, analysisBackend) {
    BaseController.call(this, authApi, pgConnection);

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

    this.req2paramsMiddleware = req2paramsMiddleware(authApi, pgConnection);
}

util.inherits(LayergroupController, BaseController);

module.exports = LayergroupController;


LayergroupController.prototype.register = function(app) {
    app.get(app.base_url_mapconfig +
        '/:token/:z/:x/:y@:scale_factor?x.:format', cors(), userMiddleware,
        this.tile.bind(this));

    app.get(app.base_url_mapconfig +
        '/:token/:z/:x/:y.:format', cors(), userMiddleware,
        this.tile.bind(this));

    app.get(app.base_url_mapconfig +
        '/:token/:layer/:z/:x/:y.(:format)', cors(), userMiddleware,
        this.layer.bind(this));

    app.get(app.base_url_mapconfig + '/:token/:layer/attributes/:fid',
        cors(),
        userMiddleware,
        this.req2paramsMiddleware,
        this.attributes.bind(this)
    );

    app.get(app.base_url_mapconfig + '/static/center/:token/:z/:lat/:lng/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.req2paramsMiddleware,
        this.center.bind(this)
    );

    app.get(app.base_url_mapconfig + '/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer']),
        this.req2paramsMiddleware,
        this.bbox.bind(this)
    );

    // Undocumented/non-supported API endpoint methods.
    // Use at your own peril.

    var allowedDataviewQueryParams = [
        'filters', // json
        'own_filter', // 0, 1
        'bbox', // w,s,e,n
        'start', // number
        'end', // number
        'column_type', // string
        'bins', // number
        'aggregation', //string
        'offset', // number
        'q' // widgets search
    ];

    app.get(
        app.base_url_mapconfig + '/:token/dataview/:dataviewName',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.req2paramsMiddleware,
        this.dataview.bind(this)
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.req2paramsMiddleware,
        this.dataview.bind(this)
    );

    app.get(
        app.base_url_mapconfig + '/:token/dataview/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.req2paramsMiddleware,
        this.dataviewSearch.bind(this)
    );

    app.get(
        app.base_url_mapconfig + '/:token/:layer/widget/:dataviewName/search',
        cors(),
        userMiddleware,
        allowQueryParams(allowedDataviewQueryParams),
        this.req2paramsMiddleware,
        this.dataviewSearch.bind(this)
    );

    app.get(app.base_url_mapconfig + '/:token/analysis/node/:nodeId',
        cors(),
        userMiddleware,
        this.req2paramsMiddleware,
        this.analysisNodeStatus.bind(this)
    );
};

LayergroupController.prototype.analysisNodeStatus = function(req, res, next) {
    var self = this;

    step(
        function retrieveNodeStatus() {
            self.analysisStatusBackend.getNodeStatus(req.params, this);
        },
        function finish(err, nodeStatus, stats) {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET NODE STATUS';
                next(err);
            } else {
                self.sendResponse(req, res, nodeStatus, 200, {
                    'Cache-Control': 'public,max-age=5',
                    'Last-Modified': new Date().toUTCString()
                });
            }
        }
    );
};

LayergroupController.prototype.dataview = function(req, res, next) {
    var self = this;

    step(
        function retrieveDataview() {
            var mapConfigProvider = new MapStoreMapConfigProvider(
                self.mapStore, req.context.user, self.userLimitsApi, req.params
            );
            self.dataviewBackend.getDataview(mapConfigProvider, req.context.user, req.params, this);
        },
        function finish(err, dataview, stats) {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET DATAVIEW';
                next(err);
            } else {
                self.sendResponse(req, res, dataview, 200);
            }
        }
    );
};

LayergroupController.prototype.dataviewSearch = function(req, res, next) {
    var self = this;

    step(
        function searchDataview() {
            var mapConfigProvider = new MapStoreMapConfigProvider(
                self.mapStore, req.context.user, self.userLimitsApi, req.params
            );
            self.dataviewBackend.search(mapConfigProvider, req.context.user, req.params, this);
        },
        function finish(err, searchResult, stats) {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET DATAVIEW SEARCH';
                next(err);
            } else {
                self.sendResponse(req, res, searchResult, 200);
            }
        }
    );

};

LayergroupController.prototype.attributes = function(req, res, next) {
    var self = this;

    req.profiler.start('windshaft.maplayer_attribute');

    step(
        function retrieveFeatureAttributes() {
            var mapConfigProvider = new MapStoreMapConfigProvider(
                self.mapStore, req.context.user, self.userLimitsApi, req.params
            );
            self.attributesBackend.getFeatureAttributes(mapConfigProvider, req.params, false, this);
        },
        function finish(err, tile, stats) {
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'GET ATTRIBUTES';
                next(err);
            } else {
                self.sendResponse(req, res, tile, 200);
            }
        }
    );

};

// Gets a tile for a given token and set of tile ZXY coords. (OSM style)
LayergroupController.prototype.tile = function(req, res, next) {
    req.profiler.start('windshaft.map_tile');
    this.tileOrLayer(req, res, next);
};

// Gets a tile for a given token, layer set of tile ZXY coords. (OSM style)
LayergroupController.prototype.layer = function(req, res, next) {
    if (req.params.token === 'static') {
        return next();
    }
    req.profiler.start('windshaft.maplayer_tile');
    this.tileOrLayer(req, res, next);
};

LayergroupController.prototype.tileOrLayer = function (req, res, next) {
    var self = this;

    step(
        function mapController$prepareParams() {
            self.req2params(req, res, this);
        },
        function mapController$getTileOrGrid(err) {
            assert.ifError(err);
            self.tileBackend.getTile(
                new MapStoreMapConfigProvider(self.mapStore, req.context.user, self.userLimitsApi, req.params),
                req.params, this
            );
        },
        function mapController$finalize(err, tile, headers, stats) {
            req.profiler.add(stats);
            self.finalizeGetTileOrGrid(err, req, res, tile, headers, next);
        }
    );
};

// This function is meant for being called as the very last
// step by all endpoints serving tiles or grids
LayergroupController.prototype.finalizeGetTileOrGrid = function(err, req, res, tile, headers, next) {
    var supportedFormats = {
        grid_json: true,
        json_torque: true,
        torque_json: true,
        png: true,
        png32: true,
        mvt: true
    };

    var formatStat = 'invalid';
    if (req.params.format) {
        var format = req.params.format.replace('.', '_');
        if (supportedFormats[format]) {
            formatStat = format;
        }
    }

    if (err) {
        // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
        var errMsg = err.message ? ( '' + err.message ) : ( '' + err );

        // Rewrite mapnik parsing errors to start with layer number
        var matches = errMsg.match("(.*) in style 'layer([0-9]+)'");
        if (matches) {
            errMsg = 'style'+matches[2]+': ' + matches[1];
        }
        err.message = errMsg;

        err.label = 'TILE RENDER';
        next(err);

        global.statsClient.increment('windshaft.tiles.error');
        global.statsClient.increment('windshaft.tiles.' + formatStat + '.error');
    } else {
        this.sendResponse(req, res, tile, 200, headers);
        global.statsClient.increment('windshaft.tiles.success');
        global.statsClient.increment('windshaft.tiles.' + formatStat + '.success');
    }
};

LayergroupController.prototype.bbox = function(req, res, next) {
    this.staticMap(req, res, +req.params.width, +req.params.height, {
        west: +req.params.west,
        north: +req.params.north,
        east: +req.params.east,
        south: +req.params.south
    }, next);
};

LayergroupController.prototype.center = function(req, res, next) {
    this.staticMap(req, res, +req.params.width, +req.params.height, +req.params.z, {
        lng: +req.params.lng,
        lat: +req.params.lat
    }, next);
};

LayergroupController.prototype.staticMap = function(req, res, width, height, zoom /* bounds */, center, next) {
    var format = req.params.format === 'jpg' ? 'jpeg' : 'png';
    req.params.layer = req.params.layer || 'all';
    req.params.format = req.params.format || 'png';

    var self = this;

    step(
        function getImage() {
            if (center) {
                self.previewBackend.getImage(
                    new MapStoreMapConfigProvider(self.mapStore, req.context.user, self.userLimitsApi, req.params),
                    format, width, height, zoom, center, this);
            } else {
                self.previewBackend.getImage(
                    new MapStoreMapConfigProvider(self.mapStore, req.context.user, self.userLimitsApi, req.params),
                    format, width, height, zoom /* bounds */, this);
            }
        },
        function handleImage(err, image, headers, stats) {
            req.profiler.done('render-' + format);
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'STATIC_MAP';
                next(err);
            } else {
                res.set('Content-Type', headers['Content-Type'] || 'image/' + format);
                self.sendResponse(req, res, image, 200);
            }
        }
    );
};

LayergroupController.prototype.sendResponse = function(req, res, body, status, headers) {
    var self = this;

    req.profiler.done('res');

    res.set('Cache-Control', 'public,max-age=31536000');

    // Set Last-Modified header
    var lastUpdated;
    if (req.params.cache_buster) {
        // Assuming cache_buster is a timestamp
        lastUpdated = new Date(parseInt(req.params.cache_buster));
    } else {
        lastUpdated = new Date();
    }
    res.set('Last-Modified', lastUpdated.toUTCString());

    var dbName = req.params.dbname;
    step(
        function getAffectedTables() {
            self.getAffectedTables(req.context.user, dbName, req.params.token, this);
        },
        function sendResponse(err, affectedTables) {
            req.profiler.done('affectedTables');
            if (err) {
                global.logger.warn('ERROR generating cache channel: ' + err);
            }
            if (!!affectedTables) {
                res.set('X-Cache-Channel', affectedTables.getCacheChannel());
                self.surrogateKeysCache.tag(res, affectedTables);
            }
            self.send(req, res, body, status, headers);
        }
    );

};

LayergroupController.prototype.getAffectedTables = function(user, dbName, layergroupId, callback) {

    if (this.layergroupAffectedTables.hasAffectedTables(dbName, layergroupId)) {
        return callback(null, this.layergroupAffectedTables.get(dbName, layergroupId));
    }

    var self = this;
    step(
        function extractSQL() {
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
                this
            );
        },
        function findAffectedTables(err, sql) {
            assert.ifError(err);

            if ( ! sql ) {
                throw new Error("this request doesn't need an X-Cache-Channel generated");
            }

            step(
                function getConnection() {
                    self.pgConnection.getConnection(user, this);
                },
                function getAffectedTables(err, connection) {
                    assert.ifError(err);

                    QueryTables.getAffectedTablesFromQuery(connection, sql, this);
                },
                this
            );
        },
        function buildCacheChannel(err, tables) {
            assert.ifError(err);
            self.layergroupAffectedTables.set(dbName, layergroupId, tables);

            return tables;
        },
        callback
    );
};
