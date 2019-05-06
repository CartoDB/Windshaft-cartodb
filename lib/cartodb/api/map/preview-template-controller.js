'use strict';

const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const namedMapProvider = require('../middlewares/named-map-provider');
const cacheControlHeader = require('../middlewares/cache-control-header');
const cacheChannelHeader = require('../middlewares/cache-channel-header');
const surrogateKeyHeader = require('../middlewares/surrogate-key-header');
const lastModifiedHeader = require('../middlewares/last-modified-header');
const checkStaticImageFormat = require('../middlewares/check-static-image-format');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

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

module.exports = class PreviewTemplateController {
    constructor (
        namedMapProviderCache,
        previewBackend,
        surrogateKeysCache,
        tablesExtentBackend,
        metadataBackend,
        pgConnection,
        authBackend,
        userLimitsBackend
    ) {
        this.namedMapProviderCache = namedMapProviderCache;
        this.previewBackend = previewBackend;
        this.surrogateKeysCache = surrogateKeysCache;
        this.tablesExtentBackend = tablesExtentBackend;
        this.metadataBackend = metadataBackend;
        this.pgConnection = pgConnection;
        this.authBackend = authBackend;
        this.userLimitsBackend = userLimitsBackend;
    }

    register (mapRouter) {
        mapRouter.get('/static/named/:template_id/:width/:height.:format', this.middlewares());
    }

    middlewares () {
        return [
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.STATIC_NAMED),
            cleanUpQueryParams(['layer', 'zoom', 'lon', 'lat', 'bbox']),
            checkStaticImageFormat(),
            namedMapProvider({
                namedMapProviderCache: this.namedMapProviderCache,
                label: 'STATIC_VIZ_MAP', forcedFormat: 'png'
            }),
            getTemplate({ label: 'STATIC_VIZ_MAP' }),
            prepareLayerFilterFromPreviewLayers({
                namedMapProviderCache: this.namedMapProviderCache,
                label: 'STATIC_VIZ_MAP'
            }),
            getStaticImageOptions({ tablesExtentBackend: this.tablesExtentBackend }),
            getImage({ previewBackend: this.previewBackend, label: 'STATIC_VIZ_MAP' }),
            setContentTypeHeader(),
            incrementMapViews({ metadataBackend: this.metadataBackend }),
            cacheControlHeader(),
            cacheChannelHeader(),
            surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
            lastModifiedHeader()
        ];
    }
};

function getTemplate ({ label }) {
    return function getTemplateMiddleware (req, res, next) {
        const { mapConfigProvider } = res.locals;

        mapConfigProvider.getTemplate((err, template) => {
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
        const { template } = res.locals;
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

        const { user, token, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { template_id, format } = req.params;

        const params = {
            user, token, cache_buster, api_key,
            dbuser, dbname, dbpassword, dbhost, dbport,
            template_id, format
        };

        // overwrites 'all' default filter
        params.layer = layerVisibilityFilter.join(',');

        // recreates the provider
        namedMapProviderCache.get(user, template_id, config, auth_token, params, (err, provider) => {
            if (err) {
                err.label = label;
                return next(err);
            }

            res.locals.mapConfigProvider = provider;

            next();
        });
    };
}

function getStaticImageOptions ({ tablesExtentBackend }) {
    return function getStaticImageOptionsMiddleware(req, res, next) {
        const { user, mapConfigProvider, template } = res.locals;
        const { zoom, lon, lat, bbox } = req.query;
        const params = { zoom, lon, lat, bbox };

        const imageOpts = getImageOptions(params, template);

        if (imageOpts) {
            res.locals.imageOpts = imageOpts;
            return next();
        }

        res.locals.imageOpts = DEFAULT_ZOOM_CENTER;

        mapConfigProvider.createAffectedTables((err, affectedTables) => {
            if (err) {
                return next();
            }

            var tables = affectedTables.tables || [];

            if (tables.length === 0) {
                return next();
            }

            tablesExtentBackend.getBounds(user, tables, (err, bounds) => {
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
        const { imageOpts, mapConfigProvider } = res.locals;
        const { zoom, center, bounds } = imageOpts;

        let { width, height } = req.params;

        width = +width;
        height = +height;

        const format = req.params.format === 'jpg' ? 'jpeg' : 'png';

        if (zoom !== undefined && center) {
            return previewBackend.getImage(mapConfigProvider, format, width, height, zoom, center,
                (err, image, headers, stats) => {
                req.profiler.add(stats);

                if (err) {
                    err.label = label;
                    return next(err);
                }

                if (headers) {
                    res.set(headers);
                }

                res.statusCode = 200;
                res.body = image;

                next();
            });
        }

        previewBackend.getImage(mapConfigProvider, format, width, height, bounds, (err, image, headers, stats) => {
            req.profiler.add(stats);
            req.profiler.done('render-' + format);

            if (err) {
                err.label = label;
                return next(err);
            }

            if (headers) {
                res.set(headers);
            }

            res.statusCode = 200;
            res.body = image;

            next();
        });
    };
}

function setContentTypeHeader () {
    return function setContentTypeHeaderMiddleware(req, res, next) {
        res.set('Content-Type', res.get('content-type') || res.get('Content-Type') || 'image/png');

        next();
    };
}

function incrementMapViewsError (ctx) {
    return `ERROR: failed to increment mapview count for user '${ctx.user}': ${ctx.err}`;
}

function incrementMapViews ({ metadataBackend }) {
    return function incrementMapViewsMiddleware(req, res, next) {
        const { user, mapConfigProvider } = res.locals;

        mapConfigProvider.getMapConfig((err, mapConfig) => {
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
