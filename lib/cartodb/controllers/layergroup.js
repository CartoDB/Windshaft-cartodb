var assert = require('assert');
var step = require('step');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

var MapStoreMapConfigProvider = require('../models/mapconfig/map_store_provider');
var TablesCacheEntry = require('../cache/model/database_tables_entry');

/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {MapStore} mapStore
 * @param {TileBackend} tileBackend
 * @param {PreviewBackend} previewBackend
 * @param {AttributesBackend} attributesBackend
 * @param {WidgetBackend} widgetBackend
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {QueryTablesApi} queryTablesApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @constructor
 */
function LayergroupController(authApi, pgConnection, mapStore, tileBackend, previewBackend, attributesBackend,
                          widgetBackend, surrogateKeysCache, userLimitsApi, queryTablesApi, layergroupAffectedTables) {
    BaseController.call(this, authApi, pgConnection);

    this.mapStore = mapStore;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.attributesBackend = attributesBackend;
    this.widgetBackend = widgetBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;
    this.layergroupAffectedTables = layergroupAffectedTables;
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

    app.get(app.base_url_mapconfig +
        '/:token/:layer/attributes/:fid', cors(), userMiddleware,
        this.attributes.bind(this));

    app.get(app.base_url_mapconfig +
        '/static/center/:token/:z/:lat/:lng/:width/:height.:format', cors(), userMiddleware,
        this.center.bind(this));

    app.get(app.base_url_mapconfig +
        '/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format', cors(), userMiddleware,
        this.bbox.bind(this));

    app.get(app.base_url_mapconfig +
        '/:token/:layer/widget/:widgetName', cors(), userMiddleware,
        this.widget.bind(this));
};

LayergroupController.prototype.widget = function(req, res) {
    var self = this;

    step(
        function setupParams() {
            self.req2params(req, this);
        },
        function retrieveList(err) {
            assert.ifError(err);

            var mapConfigProvider = new MapStoreMapConfigProvider(
                self.mapStore, req.context.user, self.userLimitsApi, req.params
            );
            self.widgetBackend.getWidget(mapConfigProvider, req.params, this);
        },
        function finish(err, tile, stats) {
            req.profiler.add(stats || {});

            if (err) {
                self.sendError(req, res, err, 'GET WIDGET');
            } else {
                self.sendResponse(req, res, tile, 200);
            }
        }
    );

};

LayergroupController.prototype.attributes = function(req, res) {
    var self = this;

    req.profiler.start('windshaft.maplayer_attribute');

    step(
        function setupParams() {
            self.req2params(req, this);
        },
        function retrieveFeatureAttributes(err) {
            assert.ifError(err);

            var mapConfigProvider = new MapStoreMapConfigProvider(
                self.mapStore, req.context.user, self.userLimitsApi, req.params
            );
            self.attributesBackend.getFeatureAttributes(mapConfigProvider, req.params, false, this);
        },
        function finish(err, tile, stats) {
            req.profiler.add(stats || {});

            if (err) {
                self.sendError(req, res, err, 'GET ATTRIBUTES');
            } else {
                self.sendResponse(req, res, tile, 200);
            }
        }
    );

};

// Gets a tile for a given token and set of tile ZXY coords. (OSM style)
LayergroupController.prototype.tile = function(req, res) {
    req.profiler.start('windshaft.map_tile');
    this.tileOrLayer(req, res);
};

// Gets a tile for a given token, layer set of tile ZXY coords. (OSM style)
LayergroupController.prototype.layer = function(req, res, next) {
    if (req.params.token === 'static') {
        return next();
    }
    req.profiler.start('windshaft.maplayer_tile');
    this.tileOrLayer(req, res);
};

LayergroupController.prototype.tileOrLayer = function (req, res) {
    var self = this;

    step(
        function mapController$prepareParams() {
            self.req2params(req, this);
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
            self.finalizeGetTileOrGrid(err, req, res, tile, headers);
        }
    );
};

// This function is meant for being called as the very last
// step by all endpoints serving tiles or grids
LayergroupController.prototype.finalizeGetTileOrGrid = function(err, req, res, tile, headers) {
    var supportedFormats = {
        grid_json: true,
        json_torque: true,
        torque_json: true,
        png: true
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

        this.sendError(req, res, err, 'TILE RENDER');
        global.statsClient.increment('windshaft.tiles.error');
        global.statsClient.increment('windshaft.tiles.' + formatStat + '.error');
    } else {
        this.sendResponse(req, res, tile, 200, headers);
        global.statsClient.increment('windshaft.tiles.success');
        global.statsClient.increment('windshaft.tiles.' + formatStat + '.success');
    }
};

LayergroupController.prototype.bbox = function(req, res) {
    this.staticMap(req, res, +req.params.width, +req.params.height, {
        west: +req.params.west,
        north: +req.params.north,
        east: +req.params.east,
        south: +req.params.south
    });
};

LayergroupController.prototype.center = function(req, res) {
    this.staticMap(req, res, +req.params.width, +req.params.height, +req.params.z, {
        lng: +req.params.lng,
        lat: +req.params.lat
    });
};

LayergroupController.prototype.staticMap = function(req, res, width, height, zoom /* bounds */, center) {
    var format = req.params.format === 'jpg' ? 'jpeg' : 'png';
    req.params.layer = 'all';
    req.params.format = 'png';

    var self = this;

    step(
        function reqParams() {
            self.req2params(req, this);
        },
        function getImage(err) {
            assert.ifError(err);
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
                self.sendError(req, res, err, 'STATIC_MAP');
            } else {
                res.set('Content-Type', headers['Content-Type'] || 'image/' + format);
                self.sendResponse(req, res, image, 200);
            }
        }
    );
};

LayergroupController.prototype.sendResponse = function(req, res, body, status, headers) {
    var self = this;

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
                var tablesCacheEntry = new TablesCacheEntry(dbName, affectedTables);
                res.set('X-Cache-Channel', tablesCacheEntry.getCacheChannel());
                self.surrogateKeysCache.tag(res, tablesCacheEntry);
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

                    var queries = mapConfig.getLayers()
                        .map(function(lyr) {
                            return lyr.options.sql;
                        })
                        .filter(function(sql) {
                            return !!sql;
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

            self.queryTablesApi.getAffectedTablesInQuery(user, sql, this); // in addCacheChannel
        },
        function buildCacheChannel(err, tableNames) {
            assert.ifError(err);

            self.layergroupAffectedTables.set(dbName, layergroupId, tableNames);

            return tableNames;
        },
        function finish(err, affectedTables) {
            callback(err, affectedTables);
        }
    );
};
