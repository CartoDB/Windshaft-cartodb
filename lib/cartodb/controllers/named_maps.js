var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');
var allowQueryParams = require('../middleware/allow-query-params');
var vectorError = require('../middleware/vector-error');

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
        userMiddleware,
        this.prepareContext,
        this.getNamedMapProvider(),
        this.tile.bind(this),
        vectorError()
    );

    app.get(
        app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format',
        cors(),
        userMiddleware,
        allowQueryParams(['layer', 'zoom', 'lon', 'lat', 'bbox']),
        this.prepareContext,
        this.getNamedMapProvider(),
        this.prepareLayerFilterFromPreviewLayers(),
        this.getStaticImageOptions(),
        this.getImage(),
        this.staticMap.bind(this)
    );
};

NamedMapsController.prototype.getNamedMapProvider = function () {
    return function getNamedMapProviderMiddleware (req, res, next) {
        const { user } = res.locals;
        const { config, auth_token } = req.query;
        const { template_id } = req.params;

        this.namedMapProviderCache.get(user, template_id, config, auth_token, res.locals, (err, namedMapProvider) => {
            if (err) {
                return next(err);
            }

            res.locals.namedMapProvider = namedMapProvider;

            next();
        });
    }.bind(this);
};

NamedMapsController.prototype.prepareLayerFilterFromPreviewLayers = function () {
    return function prepareLayerFilterFromPreviewLayersMiddleware (req, res, next) {
        const { user, namedMapProvider } = res.locals;
        const { template_id } = req.params;
        const { config, auth_token } = req.query;

        namedMapProvider.getTemplate((err, template) => {
            if (err) {
                return next(err);
            }

            if (!template || !template.view || !template.view.preview_layers) {
               return next();
            }

            var previewLayers = template.view.preview_layers;
            var layerVisibilityFilter = [];

            template.layergroup.layers.forEach(function (layer, index) {
                if (previewLayers[''+index] !== false && previewLayers[layer.id] !== false) {
                    layerVisibilityFilter.push(''+index);
                }
            });

            if (!layerVisibilityFilter.length) {
                return next();
            }

            // overwrites 'all' default filter
            res.locals.layer = layerVisibilityFilter.join(',');

            // recreates the provider
            this.namedMapProviderCache.get(user, template_id, config, auth_token, res.locals, (err, provider) => {
                if (err) {
                    return next(err);
                }

                res.locals.namedMapProvider = provider;

                next();
            });
        });
    }.bind(this);
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
    const { namedMapProvider } = res.locals;

    this.tileBackend.getTile(namedMapProvider, req.params, (err, tile, headers, stats) => {
        req.profiler.add(stats);

        if (err) {
            err.label = 'NAMED_MAP_TILE';
            return next(err);
        }

        this.sendResponse(req, res, tile, headers, namedMapProvider);
    });
};

NamedMapsController.prototype.staticMap = function(req, res, next) {
    var self = this;

    var cdbUser = res.locals.user;

    const { namedMapProvider, image, headers, stats } = res.locals;

    step(
        function incrementMapViews() {
            var next = this;
            namedMapProvider.getMapConfig(function(mapConfigErr, mapConfig) {
                self.metadataBackend.incMapviewCount(cdbUser, mapConfig.obj().stat_tag, function(sErr) {
                    if (sErr) {
                        global.logger.log("ERROR: failed to increment mapview count for user '%s': %s", cdbUser, sErr);
                    }

                    next(null, image, headers, stats);
                });
            });
        },
        function handleImage(err, image, headers, stats) {
            req.profiler.done('render-' + res.locals.format);
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

NamedMapsController.prototype.getStaticImageOptions = function () {
    return function getStaticImageOptionsMiddleware(req, res, next) {
        var self = this;

        const { user, namedMapProvider, zoom, lon, lat, bbox } = res.locals;

        if ([zoom, lon, lat].map(numMapper).every(Number.isFinite)) {
            res.locals.imageOpts = {
                zoom: zoom,
                center: {
                    lng: lon,
                    lat: lat
                }
            };

            return next();
        }

        if (bbox) {
            var _bbox = bbox.split(',').map(numMapper);
            if (_bbox.length === 4 && _bbox.every(Number.isFinite)) {
                res.locals.imageOpts = {
                    bounds: {
                        west: _bbox[0],
                        south: _bbox[1],
                        east: _bbox[2],
                        north: _bbox[3]
                    }
                };

                return next();
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
                        if (Number.isFinite(+zoom)) {
                            zoomCenter.zoom = +zoom;
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

                var _next = this;
                namedMapProvider.getAffectedTablesAndLastUpdatedTime(function(err, affectedTablesAndLastUpdate) {
                    if (err) {
                        return _next(null);
                    }

                    var affectedTables = affectedTablesAndLastUpdate.tables || [];

                    if (affectedTables.length === 0) {
                        return _next(null);
                    }

                    self.tablesExtentApi.getBounds(user, affectedTables, function (err, result) {
                        return _next(null, result);
                    });
                });

            },
            function returnCallback(err, imageOpts) {
                res.locals.imageOpts = imageOpts || DEFAULT_ZOOM_CENTER;
                return next();
            }
        );
    }.bind(this);
};

NamedMapsController.prototype.getImage = function () {
    return function getImageMiddleware (req, res, next) {
        const { imageOpts, namedMapProvider } = res.locals;
        const { zoom, center, bounds } = imageOpts;

        let { width, height } = req.params;

        width = +width;
        height = +height;

        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';
        // We force always the tile to be generated using PNG because
        // is the only format we support by now
        res.locals.format = 'png';
        res.locals.layer = res.locals.layer || 'all';

        if (!_.isUndefined(zoom) && center) {
            return this.previewBackend.getImage(namedMapProvider, format, width, height, zoom, center,
                (err, image, headers, stats) => {
                if (err) {
                    return next(err);
                }

                res.locals.image = image;
                res.locals.headers = headers;
                res.locals.stats = stats;

                next();
            });
        }

        this.previewBackend.getImage(namedMapProvider, format, width, height, bounds, (err, image, headers, stats) => {
            if (err) {
                return next(err);
            }

            res.locals.image = image;
            res.locals.headers = headers;
            res.locals.stats = stats;

            next();
        });
    }.bind(this);
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
