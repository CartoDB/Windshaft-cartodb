var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');

var TablesCacheEntry = require('../cache/model/database_tables_entry');

function NamedMapsController(app, authApi, pgConnection, namedMapProviderCache, tileBackend, previewBackend,
                             surrogateKeysCache, tablesExtentApi, metadataBackend) {
    BaseController.call(this, authApi, pgConnection);

    this.app = app;
    this.namedMapProviderCache = namedMapProviderCache;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.tablesExtentApi = tablesExtentApi;
    this.metadataBackend = metadataBackend;
}

util.inherits(NamedMapsController, BaseController);

module.exports = NamedMapsController;

NamedMapsController.prototype.register = function(app) {
    app.get(app.base_url_templated + '/:template_id/:layer/:z/:x/:y.(:format)', cors(), this.tile.bind(this));
    app.get(
        app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format', cors(), this.staticMap.bind(this)
    );
};

NamedMapsController.prototype.sendResponse = function(req, res, resource, headers, namedMapProvider) {
    this.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(req.context.user, namedMapProvider.getTemplateName()));
    res.set('Content-Type', headers['content-type'] || headers['Content-Type'] || 'image/png');
    res.set('Cache-Control', 'public,max-age=7200,must-revalidate');

    var self = this;

    var dbName = req.params.dbname;
    step(
        function getAffectedTablesAndLastUpdatedTime() {
            namedMapProvider.getAffectedTablesAndLastUpdatedTime(this);
        },
        function sendResponse(err, result) {
            req.profiler.done('affectedTables');
            if (err) {
                global.logger.log('ERROR generating cache channel: ' + err);
            }
            if (!result || !!result.affectedTables) {
                // we increase cache control as we can invalidate it
                res.set('Cache-Control', 'public,max-age=31536000');

                var lastModifiedDate;
                if (Number.isFinite(result.lastUpdatedTime)) {
                    lastModifiedDate = new Date(result.lastUpdatedTime);
                } else {
                    lastModifiedDate = new Date();
                }
                res.set('Last-Modified', lastModifiedDate.toUTCString());

                var tablesCacheEntry = new TablesCacheEntry(dbName, result.affectedTables);
                res.set('X-Cache-Channel', tablesCacheEntry.getCacheChannel());
                if (result.affectedTables.length > 0) {
                    self.surrogateKeysCache.tag(res, tablesCacheEntry);
                }
            }
            self.send(req, res, resource, 200);
        }
    );
};

NamedMapsController.prototype.tile = function(req, res) {
    var self = this;

    var cdbUser = req.context.user;

    var namedMapProvider;
    step(
        function reqParams() {
            self.req2params(req, this);
        },
        function getNamedMapProvider(err) {
            assert.ifError(err);
            self.namedMapProviderCache.get(
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                req.params,
                this
            );
        },
        function getTile(err, _namedMapProvider) {
            assert.ifError(err);
            namedMapProvider = _namedMapProvider;
            self.tileBackend.getTile(namedMapProvider, req.params, this);
        },
        function handleImage(err, tile, headers, stats) {
            if (req.profiler) {
                req.profiler.add(stats);
            }
            if (err) {
                self.sendError(req, res, err, 'NAMED_MAP_TILE');
            } else {
                self.sendResponse(req, res, tile, headers, namedMapProvider);
            }
        }
    );
};

NamedMapsController.prototype.staticMap = function(req, res) {
    var self = this;

    var cdbUser = req.context.user;

    var format = req.params.format === 'jpg' ? 'jpeg' : 'png';
    req.params.format = 'png';
    req.params.layer = 'all';

    var namedMapProvider;
    step(
        function reqParams() {
            self.req2params(req, this);
        },
        function getNamedMapProvider(err) {
            assert.ifError(err);
            self.namedMapProviderCache.get(
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                req.params,
                this
            );
        },
        function prepareImageOptions(err, _namedMapProvider) {
            assert.ifError(err);
            namedMapProvider = _namedMapProvider;
            self.getStaticImageOptions(cdbUser, namedMapProvider, this);
        },
        function getImage(err, imageOpts) {
            assert.ifError(err);

            var width = +req.params.width;
            var height = +req.params.height;

            if (!_.isUndefined(imageOpts.zoom) && imageOpts.center) {
                self.previewBackend.getImage(
                    namedMapProvider, format, width, height, imageOpts.zoom, imageOpts.center, this);
            } else {
                self.previewBackend.getImage(
                    namedMapProvider, format, width, height, imageOpts.bounds, this);
            }
        },
        function incrementMapViews(err, image, headers, stats) {
            assert.ifError(err);

            var next = this;
            namedMapProvider.getMapConfig(function(mapConfigErr, mapConfig) {
                self.metadataBackend.incMapviewCount(cdbUser, mapConfig.obj().stat_tag, function(sErr) {
                    if (err) {
                        global.logger.log("ERROR: failed to increment mapview count for user '%s': %s", cdbUser, sErr);
                    }
                    next(err, image, headers, stats);
                });
            });
        },
        function handleImage(err, image, headers, stats) {
            if (req.profiler) {
                req.profiler.done('render-' + format);
                req.profiler.add(stats || {});
            }

            if (err) {
                self.sendError(req, res, err, 'STATIC_VIZ_MAP');
            } else {
                self.sendResponse(req, res, image, headers, namedMapProvider);
            }
        }
    );
};

var DEFAULT_ZOOM_CENTER = {
    zoom: 1,
    center: {
        lng: 0,
        lat: 0
    }
};

NamedMapsController.prototype.getStaticImageOptions = function(cdbUser, namedMapProvider, callback) {
    var self = this;

    step(
        function getTemplate() {
            namedMapProvider.getTemplate(this);
        },
        function handleTemplateView(err, template) {
            assert.ifError(err);

            if (template.view) {
                var zoomCenter = templateZoomCenter(template.view);
                if (zoomCenter) {
                    return zoomCenter;
                }

                var bounds = templateBounds(template.view);
                if (bounds) {
                    return bounds;
                }
            }

            return false;
        },
        function estimateBoundsIfNoImageOpts(err, imageOpts) {
            if (imageOpts) {
                return imageOpts;
            }

            var next = this;
            namedMapProvider.getAffectedTablesAndLastUpdatedTime(function(err, affectedTablesAndLastUpdate) {
                if (err) {
                    return next(null);
                }

                var affectedTables = affectedTablesAndLastUpdate.affectedTables || [];

                if (affectedTables.length === 0) {
                    return next(null);
                }

                self.tablesExtentApi.getBounds(cdbUser, affectedTables, function(err, result) {
                    return next(null, result);
                });
            });

        },
        function returnCallback(err, imageOpts) {
            return callback(err, imageOpts || DEFAULT_ZOOM_CENTER);
        }
    );
};

function templateZoomCenter(view) {
    if (!_.isUndefined(view.zoom) && view.center) {
        return {
            zoom: view.zoom,
            center: view.center
        };
    }
    return false;
}

function templateBounds(view) {
    if (view.bounds) {
        var hasAllBounds = _.every(['west', 'south', 'east', 'north'], function(prop) {
            return Number.isFinite(view.bounds[prop]);
        });
        if (hasAllBounds) {
            return {
                bounds: {
                    west: view.bounds.west,
                    south: view.bounds.south,
                    east: view.bounds.east,
                    north: view.bounds.north
                }
            };
        } else {
            return false;
        }
    }
    return false;
}
