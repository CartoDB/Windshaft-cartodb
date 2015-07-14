var assert = require('assert');
var step = require('step');

var cors = require('../middleware/cors');

var MapStoreMapConfigProvider = require('../models/mapconfig/map_store_provider');

/**
 * @param app
 * @param {MapStore} mapStore
 * @param {TileBackend} tileBackend
 * @param {PreviewBackend} previewBackend
 * @param {AttributesBackend} attributesBackend
 * @param {UserLimitsApi} userLimitsApi
 * @param {QueryTablesApi} queryTablesApi
 * @constructor
 */
function LayergroupController(app, mapStore, tileBackend, previewBackend, attributesBackend, userLimitsApi,
                              queryTablesApi) {
    this.app = app;
    this.mapStore = mapStore;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.attributesBackend = attributesBackend;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;

    this.channelCache = {};
}

module.exports = LayergroupController;


LayergroupController.prototype.register = function(app) {
    app.get(app.base_url_mapconfig + '/:token/:z/:x/:y@:scale_factor?x.:format', cors(), this.tile.bind(this));
    app.get(app.base_url_mapconfig + '/:token/:z/:x/:y.:format', cors(), this.tile.bind(this));
    app.get(app.base_url_mapconfig + '/:token/:layer/:z/:x/:y.(:format)', cors(), this.layer.bind(this));
    app.get(app.base_url_mapconfig + '/:token/:layer/attributes/:fid', cors(), this.attributes.bind(this));
    app.get(app.base_url_mapconfig + '/static/center/:token/:z/:lat/:lng/:width/:height.:format', cors(),
        this.center.bind(this));
    app.get(app.base_url_mapconfig + '/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format', cors(),
        this.bbox.bind(this));
};

LayergroupController.prototype.attributes = function(req, res) {
    var self = this;

    req.profiler.start('windshaft.maplayer_attribute');

    step(
        function setupParams() {
            self.app.req2params(req, this);
        },
        function retrieveFeatureAttributes(err) {
            req.profiler.done('req2params');

            assert.ifError(err);

            self.attributesBackend.getFeatureAttributes(req.params, false, this);
        },
        function finish(err, tile, stats) {
            req.profiler.add(stats || {});

            if (err) {
                // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
                var errMsg = err.message ? ( '' + err.message ) : ( '' + err );
                var statusCode = self.app.findStatusCode(err);
                self.app.sendError(res, { errors: [errMsg] }, statusCode, 'GET ATTRIBUTES', err);
            } else {
                self.sendResponse(req, res, [tile, 200]);
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

    console.log(req.context.user);

    step(
        function mapController$prepareParams() {
            self.app.req2params(req, this);
        },
        function mapController$getTileOrGrid(err) {
            req.profiler.done('req2params');
            if ( err ) {
                throw err;
            }
            self.tileBackend.getTile(
                new MapStoreMapConfigProvider(self.mapStore, req.context.user, self.userLimitsApi, req.params),
                req.params, this
            );
        },
        function mapController$finalize(err, tile, headers, stats) {
            req.profiler.add(stats);
            self.finalizeGetTileOrGrid(err, req, res, tile, headers);
            return null;
        },
        function finish(err) {
            if ( err ) {
                console.error("windshaft.tiles: " + err);
            }
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

    if (err){
        // See https://github.com/Vizzuality/Windshaft-cartodb/issues/68
        var errMsg = err.message ? ( '' + err.message ) : ( '' + err );
        var statusCode = this.app.findStatusCode(err);

        // Rewrite mapnik parsing errors to start with layer number
        var matches = errMsg.match("(.*) in style 'layer([0-9]+)'");
        if (matches) {
            errMsg = 'style'+matches[2]+': ' + matches[1];
        }

        this.app.sendError(res, { errors: ['' + errMsg] }, statusCode, 'TILE RENDER', err);
        global.statsClient.increment('windshaft.tiles.error');
        global.statsClient.increment('windshaft.tiles.' + formatStat + '.error');
    } else {
        this.sendResponse(req, res, [tile, headers, 200]);
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
        function() {
            self.app.req2params(req, this);
        },
        function(err) {
            req.profiler.done('req2params');
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
                if (!err.error) {
                    err.error = err.message;
                }
                self.app.sendError(res, {errors: ['' + err] }, self.app.findStatusCode(err), 'STATIC_MAP', err);
            } else {
                res.setHeader('Content-Type', headers['Content-Type'] || 'image/' + format);
                self.sendResponse(req, res, [image, 200]);
            }
        }
    );
};

LayergroupController.prototype.sendResponse = function(req, res, args) {
    var self = this;

    res.header('Cache-Control', 'public,max-age=31536000');

    // Set Last-Modified header
    var lastUpdated;
    if (req.params.cache_buster) {
        // Assuming cache_buster is a timestamp
        lastUpdated = new Date(parseInt(req.params.cache_buster));
    } else {
        lastUpdated = new Date();
    }
    res.header('Last-Modified', lastUpdated.toUTCString());

    step(
        function getCacheChannel() {
            self.cacheChannel(req, this);
        },
        function sendResponse(err, cacheChannel) {
            if (err) {
                console.log('ERROR generating cache channel: ' + err);
            }
            if (!!cacheChannel) {
                res.header('X-Cache-Channel', cacheChannel);
            }
            self.app.sendResponse(res, args);
        }
    );

};

LayergroupController.prototype.buildCacheChannel = function (dbName, tableNames){
    return dbName + ':' + tableNames.join(',');
};

LayergroupController.prototype.cacheChannel = function(req, callback) {
    if (req.profiler) {
        req.profiler.start('addCacheChannel');
    }

    var dbName = req.params.dbname;

    // no token means no tables associated
    if (!req.params.token) {
        return callback(null, this.buildCacheChannel(dbName, []));
    }

    var self = this;

    var cacheKey = [ dbName, req.params.token ].join(':');

    step(
        function checkCached() {
            if ( self.channelCache.hasOwnProperty(cacheKey) ) {
                return callback(null, self.channelCache[cacheKey]);
            }
            return null;
        },
        function extractSQL(err) {
            assert.ifError(err);

            step(
                function loadFromStore() {
                    self.mapStore.load(req.params.token, this);
                },
                function getSQL(err, mapConfig) {
                    if (req.profiler) {
                        req.profiler.done('mapStore_load');
                    }
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

            self.queryTablesApi.getAffectedTablesInQuery(req.context.user, sql, this); // in addCacheChannel
        },
        function buildCacheChannel(err, tableNames) {
            assert.ifError(err);

            if (req.profiler) {
                req.profiler.done('affectedTables');
            }

            var cacheChannel = self.buildCacheChannel(dbName, tableNames);
            self.channelCache[cacheKey] = cacheChannel;

            return cacheChannel;
        },
        function finish(err, cacheChannel) {
            callback(err, cacheChannel);
        }
    );
};
