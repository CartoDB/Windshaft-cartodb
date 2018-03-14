const NamedMapsCacheEntry = require('../cache/model/named_maps_entry');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');
const allowQueryParams = require('../middleware/allow-query-params');
const vectorError = require('../middleware/vector-error');

const DEFAULT_ZOOM_CENTER = {
    zoom: 1,
    center: {
        lng: 0,
        lat: 0
    }
};

function numMapper(n) {
    return +n;
}

function getRequestParams(locals) {
    const params = Object.assign({}, locals);

    delete params.template;
    delete params.affectedTablesAndLastUpdate;
    delete params.namedMapProvider;
    delete params.allowedQueryParams;

    return params;
}

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
    const tileOptions = {
        namedMapProviderCache: this.namedMapProviderCache,
        tileBackend: this.tileBackend,
        label: 'NAMED_MAP_TILE'
    };

    app.get(
        app.base_url_templated + '/:template_id/:layer/:z/:x/:y.(:format)',
        cors(),
        userMiddleware(),
        this.prepareContext,
        getNamedMapProvider(tileOptions),
        getAffectedTables(),
        getTile(tileOptions),
        setSurrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        setCacheChannelHeader(),
        this.setLastModifiedHeader(),
        this.setCacheControlHeader(),
        this.setContentTypeHeader(),
        this.respond(),
        vectorError()
    );

    const staticOptions = {
        previewBackend: this.previewBackend,
        namedMapProviderCache: this.namedMapProviderCache,
        forcedFormat: 'png',
        label: 'STATIC_VIZ_MAP'
    };

    app.get(
        app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format',
        cors(),
        userMiddleware(),
        allowQueryParams(['layer', 'zoom', 'lon', 'lat', 'bbox']),
        this.prepareContext,
        getNamedMapProvider(staticOptions),
        getAffectedTables(),
        getTemplate(staticOptions),
        prepareLayerFilterFromPreviewLayers(staticOptions),
        getStaticImageOptions({ tablesExtentApi: this.tablesExtentApi }),
        getImage(staticOptions),
        incrementMapViews({ metadataBackend: this.metadataBackend }),
        setSurrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        setCacheChannelHeader(),
        this.setLastModifiedHeader(),
        this.setCacheControlHeader(),
        this.setContentTypeHeader(),
        this.respond()
    );
};

function getNamedMapProvider ({ namedMapProviderCache, label, forcedFormat = null }) {
    return function getNamedMapProviderMiddleware (req, res, next) {
        const { user } = res.locals;
        const { config, auth_token } = req.query;
        const { template_id } = req.params;

        if (forcedFormat) {
            res.locals.format = forcedFormat;
            res.locals.layer = res.locals.layer || 'all';
        }

        const params = getRequestParams(res.locals);

        namedMapProviderCache.get(user, template_id, config, auth_token, params, (err, namedMapProvider) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.namedMapProvider = namedMapProvider;

            next();
        });
    };
}

function getAffectedTables () {
    return function getAffectedTables (req, res, next) {
        const { namedMapProvider } = res.locals;

        namedMapProvider.getAffectedTablesAndLastUpdatedTime((err, affectedTablesAndLastUpdate) => {
            req.profiler.done('affectedTables');

            if (err) {
                return next(err);
            }

            res.locals.affectedTablesAndLastUpdate = affectedTablesAndLastUpdate;

            next();
        });
    };
}

function getTemplate ({ label }) {
    return function getTemplateMiddleware (req, res, next) {
        const { namedMapProvider } = res.locals;

        namedMapProvider.getTemplate((err, template) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.template = template;

            next();
        });
    };
}

function prepareLayerFilterFromPreviewLayers ({ namedMapProviderCache, label }) {
    return function prepareLayerFilterFromPreviewLayersMiddleware (req, res, next) {
        const { user, template } = res.locals;
        const { template_id } = req.params;
        const { config, auth_token } = req.query;

        if (!template || !template.view || !template.view.preview_layers) {
            return next();
        }

        var previewLayers = template.view.preview_layers;
        var layerVisibilityFilter = [];

        template.layergroup.layers.forEach((layer, index) => {
            if (previewLayers[''+index] !== false && previewLayers[layer.id] !== false) {
                layerVisibilityFilter.push(''+index);
            }
        });

        if (!layerVisibilityFilter.length) {
            return next();
        }

        const params = getRequestParams(res.locals);

        // overwrites 'all' default filter
        params.layer = layerVisibilityFilter.join(',');

        // recreates the provider
        namedMapProviderCache.get(user, template_id, config, auth_token, params, (err, provider) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.namedMapProvider = provider;

            next();
        });
    };
}

function getTile ({ tileBackend, label }) {
    return function getTileMiddleware (req, res, next) {
        const { namedMapProvider } = res.locals;

        tileBackend.getTile(namedMapProvider, req.params, (err, tile, headers, stats) => {
            req.profiler.add(stats);

            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.body = tile;
            res.locals.headers = headers;
            res.locals.stats = stats;

            next();
        });
    };
}

function getStaticImageOptions ({ tablesExtentApi }) {
    return function getStaticImageOptionsMiddleware(req, res, next) {
        const { user, namedMapProvider, template } = res.locals;

        const imageOpts = getImageOptions(res.locals, template);

        if (imageOpts) {
            res.locals.imageOpts = imageOpts;
            return next();
        }

        res.locals.imageOpts = DEFAULT_ZOOM_CENTER;

        namedMapProvider.getAffectedTablesAndLastUpdatedTime((err, affectedTablesAndLastUpdate) => {
            if (err) {
                return next();
            }

            var affectedTables = affectedTablesAndLastUpdate.tables || [];

            if (affectedTables.length === 0) {
                return next();
            }

            tablesExtentApi.getBounds(user, affectedTables, (err, bounds) => {
                if (err) {
                    return next();
                }

                res.locals.imageOpts = bounds;

                return next();
            });
        });
    };
}

function getImageOptions (params, template) {
    const { zoom, lon, lat, bbox } = params;

    let imageOpts = getImageOptionsFromCoordinates(zoom, lon, lat);
    if (imageOpts) {
        return imageOpts;
    }

    imageOpts = getImageOptionsFromBoundingBox(bbox);
    if (imageOpts) {
        return imageOpts;
    }

    imageOpts = getImageOptionsFromTemplate(template, zoom);
    if (imageOpts) {
        return imageOpts;
    }
}

function getImageOptionsFromCoordinates (zoom, lon, lat) {
    if ([zoom, lon, lat].map(numMapper).every(Number.isFinite)) {
        return {
            zoom: zoom,
            center: {
                lng: lon,
                lat: lat
            }
        };
    }
}


function getImageOptionsFromTemplate (template, zoom) {
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
}

function getImageOptionsFromBoundingBox (bbox = '') {
    var _bbox = bbox.split(',').map(numMapper);

    if (_bbox.length === 4 && _bbox.every(Number.isFinite)) {
        return {
            bounds: {
                west: _bbox[0],
                south: _bbox[1],
                east: _bbox[2],
                north: _bbox[3]
            }
        };
    }
}

function getImage({ previewBackend, label }) {
    return function getImageMiddleware (req, res, next) {
        const { imageOpts, namedMapProvider } = res.locals;
        const { zoom, center, bounds } = imageOpts;

        let { width, height } = req.params;

        width = +width;
        height = +height;

        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';

        if (zoom !== undefined && center) {
            return previewBackend.getImage(namedMapProvider, format, width, height, zoom, center,
                (err, image, headers, stats) => {
                if (err) {
                    err.label = label;
                    return next(err);
                }

                res.locals.body = image;
                res.locals.headers = headers;
                res.locals.stats = stats;

                next();
            });
        }

        previewBackend.getImage(namedMapProvider, format, width, height, bounds, (err, image, headers, stats) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.body = image;
            res.locals.headers = headers;
            res.locals.stats = stats;

            next();
        });
    };
}

function incrementMapViewsError (ctx) {
    return `ERROR: failed to increment mapview count for user '${ctx.user}': ${ctx.err}`;
}

function incrementMapViews ({ metadataBackend }) {
    return function incrementMapViewsMiddleware(req, res, next) {
        const { user, namedMapProvider } = res.locals;

        namedMapProvider.getMapConfig((err, mapConfig) => {
            if (err) {
                global.logger.log(incrementMapViewsError({ user, err }));
                return next();
            }

            const statTag = mapConfig.obj().stat_tag;

            metadataBackend.incMapviewCount(user, statTag, (err) => {
                if (err) {
                    global.logger.log(incrementMapViewsError({ user, err }));
                }

                next();
            });
        });
    };
}

function templateZoomCenter(view) {
    if (view.zoom !== undefined && view.center) {
        return {
            zoom: view.zoom,
            center: view.center
        };
    }
    return false;
}

function templateBounds(view) {
    if (view.bounds) {
        var hasAllBounds = ['west', 'south', 'east', 'north'].every(prop => Number.isFinite(view.bounds[prop]));

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

function setSurrogateKeyHeader ({ surrogateKeysCache }) {
    return function setSurrogateKeyHeaderMiddleware(req, res, next) {
        const { user, namedMapProvider, affectedTablesAndLastUpdate } = res.locals;

        surrogateKeysCache.tag(res, new NamedMapsCacheEntry(user, namedMapProvider.getTemplateName()));
        if (!affectedTablesAndLastUpdate || !!affectedTablesAndLastUpdate.tables) {
            if (affectedTablesAndLastUpdate.tables.length > 0) {
                surrogateKeysCache.tag(res, affectedTablesAndLastUpdate);
            }
        }

        next();
    };
}

function setCacheChannelHeader () {
    return function setCacheChannelHeaderMiddleware (req, res, next) {
        const { affectedTablesAndLastUpdate } = res.locals;

        if (!affectedTablesAndLastUpdate || !!affectedTablesAndLastUpdate.tables) {
            res.set('X-Cache-Channel', affectedTablesAndLastUpdate.getCacheChannel());
        }

        next();
    };
}

NamedMapsController.prototype.setLastModifiedHeader = function () {
    return function setLastModifiedHeaderMiddleware(req, res, next) {
        const { affectedTablesAndLastUpdate } = res.locals;

        if (!affectedTablesAndLastUpdate || !!affectedTablesAndLastUpdate.tables) {
            var lastModifiedDate;
            if (Number.isFinite(affectedTablesAndLastUpdate.lastUpdatedTime)) {
                lastModifiedDate = new Date(affectedTablesAndLastUpdate.getLastUpdatedAt());
            } else {
                lastModifiedDate = new Date();
            }

            res.set('Last-Modified', lastModifiedDate.toUTCString());
        }

        next();
    };
 };

NamedMapsController.prototype.setCacheControlHeader = function () {
    return function setCacheControlHeaderMiddleware(req, res, next) {
        const { affectedTablesAndLastUpdate } = res.locals;

        res.set('Cache-Control', 'public,max-age=7200,must-revalidate');

        if (!affectedTablesAndLastUpdate || !!affectedTablesAndLastUpdate.tables) {
            // we increase cache control as we can invalidate it
            res.set('Cache-Control', 'public,max-age=31536000');
        }

        next();
    };
 };

NamedMapsController.prototype.setContentTypeHeader = function () {
    return function setContentTypeHeaderMiddleware(req, res, next) {
        const { headers = {} } = res.locals;

        res.set('Content-Type', headers['content-type'] || headers['Content-Type'] || 'image/png');

        next();
    };
};

NamedMapsController.prototype.respond = function () {
    return function respondMiddleware (req, res) {
        const { body, stats = {}, format } = res.locals;

        req.profiler.done('render-' + format);
        req.profiler.add(stats);

        res.status(200);
        res.send(body);
    };
};
