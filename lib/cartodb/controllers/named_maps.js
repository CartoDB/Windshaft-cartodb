var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var cors = require('../middleware/cors');
var usernameMiddleware = require('../middleware/user').getUsername;
var allowQueryParams = require('../middleware/allow-query-params');

function NamedMapsController(prepareContext, namedMapProviderCache, tileBackend, previewBackend,
                             surrogateKeysCache, tablesExtentApi, metadataBackend) {
    this.namedMapProviderCache = namedMapProviderCache;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.tablesExtentApi = tablesExtentApi;
    this.metadataBackend = metadataBackend;
    this.prepareContext = prepareContext;
}

module.exports = NamedMapsController;

NamedMapsController.prototype.register = function(app) {
    app.get(
        app.base_url_templated + '/:template_id/:layer/:z/:x/:y.(:format)',
        cors(),
        usernameMiddleware(),
        this.prepareContext,
        this.tile.bind(this)
    );

    app.get(
        app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format',
        cors(),
        usernameMiddleware(),
        allowQueryParams(['layer', 'zoom', 'lon', 'lat', 'bbox']),
        this.prepareContext,
        this.staticMap.bind(this)
    );
};

NamedMapsController.prototype.sendResponse = function(req, res, body, headers, namedMapProvider) {
    this.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(res.locals.user, namedMapProvider.getTemplateName()));
    res.set('Content-Type', headers['content-type'] || headers['Content-Type'] || 'image/png');
    res.set('Cache-Control', 'public,max-age=7200,must-revalidate');

    var self = this;

    step(
        function getAffectedTablesAndLastUpdatedTime() {
            namedMapProvider.getAffectedTablesAndLastUpdatedTime(this);
        },
        function sendResponse(err, result) {
            req.profiler.done('affectedTables');
            if (err) {
                global.logger.log('ERROR generating cache channel: ' + err);
            }
            if (!result || !!result.tables) {
                // we increase cache control as we can invalidate it
                res.set('Cache-Control', 'public,max-age=31536000');

                var lastModifiedDate;
                if (Number.isFinite(result.lastUpdatedTime)) {
                    lastModifiedDate = new Date(result.getLastUpdatedAt());
                } else {
                    lastModifiedDate = new Date();
                }
                res.set('Last-Modified', lastModifiedDate.toUTCString());

                res.set('X-Cache-Channel', result.getCacheChannel());
                if (result.tables.length > 0) {
                    self.surrogateKeysCache.tag(res, result);
                }
            }
            res.status(200);
            res.send(body);
        }
    );
};

NamedMapsController.prototype.tile = function(req, res, next) {
    var self = this;

    var cdbUser = res.locals.user;

    var namedMapProvider;
    step(
        function getNamedMapProvider() {
            self.namedMapProviderCache.get(
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                res.locals,
                this
            );
        },
        function getTile(err, _namedMapProvider) {
            assert.ifError(err);
            namedMapProvider = _namedMapProvider;
            self.tileBackend.getTile(namedMapProvider, req.params, this);
        },
        function handleImage(err, tile, headers, stats) {
            req.profiler.add(stats);
            if (err) {
                err.label = 'NAMED_MAP_TILE';
                next(err);
            } else {
                self.sendResponse(req, res, tile, headers, namedMapProvider);
            }
        }
    );
};

NamedMapsController.prototype.staticMap = function(req, res, next) {
    var self = this;

    var cdbUser = res.locals.user;

    var format = req.params.format === 'jpg' ? 'jpeg' : 'png';
    res.locals.format = req.params.format || 'png';
    res.locals.layer = res.locals.layer || 'all';

    var namedMapProvider;
    step(
        function getNamedMapProvider() {
            self.namedMapProviderCache.get(
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                res.locals,
                this
            );
        },
        function prepareLayerVisibility(err, _namedMapProvider) {
            assert.ifError(err);

            namedMapProvider = _namedMapProvider;

            self.prepareLayerFilterFromPreviewLayers(cdbUser, req, res.locals, namedMapProvider, this);
        },
        function prepareImageOptions(err) {
            assert.ifError(err);
            self.getStaticImageOptions(cdbUser, res.locals, namedMapProvider, this);
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
            req.profiler.done('render-' + format);
            req.profiler.add(stats || {});

            if (err) {
                err.label = 'STATIC_VIZ_MAP';
                next(err);
            } else {
                self.sendResponse(req, res, image, headers, namedMapProvider);
            }
        }
    );
};

NamedMapsController.prototype.prepareLayerFilterFromPreviewLayers = function (
    user,
    req,
    params,
    namedMapProvider,
    callback
) {
    var self = this;
    namedMapProvider.getTemplate(function (err, template) {
        if (err) {
            return callback(err);
        }

        if (!template || !template.view || !template.view.preview_layers) {
           return callback();
        }

        var previewLayers = template.view.preview_layers;
        var layerVisibilityFilter = [];

        template.layergroup.layers.forEach(function (layer, index) {
            if (previewLayers[''+index] !== false && previewLayers[layer.id] !== false) {
                layerVisibilityFilter.push(''+index);
            }
        });

        if (!layerVisibilityFilter.length) {
            return callback();
        }

        // overwrites 'all' default filter
        params.layer = layerVisibilityFilter.join(',');

        // recreates the provider
        self.namedMapProviderCache.get(
            user,
            req.params.template_id,
            req.query.config,
            req.query.auth_token,
            params,
            callback
        );
    });
};

var DEFAULT_ZOOM_CENTER = {
    zoom: 1,
    center: {
        lng: 0,
        lat: 0
    }
};

function numMapper(n) {
    return +n;
}

NamedMapsController.prototype.getStaticImageOptions = function(cdbUser, params, namedMapProvider, callback) {
    var self = this;

    if ([params.zoom, params.lon, params.lat].map(numMapper).every(Number.isFinite)) {
        return callback(null, {
            zoom: params.zoom,
            center: {
                lng: params.lon,
                lat: params.lat
            }
        });
    }

    if (params.bbox) {
        var bbox = params.bbox.split(',').map(numMapper);
        if (bbox.length === 4 && bbox.every(Number.isFinite)) {
            return callback(null, {
                bounds: {
                    west: bbox[0],
                    south: bbox[1],
                    east: bbox[2],
                    north: bbox[3]
                }
            });
        }
    }

    step(
        function getTemplate() {
            namedMapProvider.getTemplate(this);
        },
        function handleTemplateView(err, template) {
            assert.ifError(err);

            if (template.view) {
                var zoomCenter = templateZoomCenter(template.view);
                if (zoomCenter) {
                    if (Number.isFinite(+params.zoom)) {
                        zoomCenter.zoom = +params.zoom;
                    }
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

                var affectedTables = affectedTablesAndLastUpdate.tables || [];

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
