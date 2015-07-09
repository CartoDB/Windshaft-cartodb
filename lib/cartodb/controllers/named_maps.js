var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');
var cors = require('../middleware/cors');

var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');

function NamedMapsController(app, pgConnection, mapStore, templateMaps, metadataBackend, mapBackend, tileBackend,
                             previewBackend, templateBaseUrl, surrogateKeysCache, tablesExtentApi) {
    this.app = app;
    this.mapStore = mapStore;
    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.metadataBackend = metadataBackend;
    this.mapBackend = mapBackend;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.templateBaseUrl = templateBaseUrl;
    this.surrogateKeysCache = surrogateKeysCache;
    this.tablesExtentApi = tablesExtentApi;
}

module.exports = NamedMapsController;

NamedMapsController.prototype.register = function(app) {
    app.get(this.templateBaseUrl + '/:template_id/:layer/:z/:x/:y.(:format)', cors(), this.tile.bind(this));
    app.get(this.templateBaseUrl + '/:template_id/jsonp', cors(), this.jsonp.bind(this));
    app.get(
        app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format', cors(), this.staticMap.bind(this)
    );
    app.post(this.templateBaseUrl + '/:template_id', cors(), this.instantiate.bind(this));
};

NamedMapsController.prototype.instantiate = function(req, res) {
    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_post');
    }

    this.instantiateTemplate(req, res, function prepareTemplateParams(callback) {
        if (!req.is('application/json')) {
            return callback(new Error('Template POST data must be of type application/json'));
        }
        return callback(null, req.body);
    });
};

NamedMapsController.prototype.jsonp = function(req, res) {
    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_get');
    }

    this.instantiateTemplate(req, res, function prepareJsonTemplateParams(callback) {
        var err = null;
        if ( req.query.callback === undefined || req.query.callback.length === 0) {
            err = new Error('callback parameter should be present and be a function name');
        }

        var templateParams = {};
        if (req.query.config) {
            try {
                templateParams = JSON.parse(req.query.config);
            } catch(e) {
                err = new Error('Invalid config parameter, should be a valid JSON');
            }
        }

        return callback(err, templateParams);
    });
};

NamedMapsController.prototype.tile = function(req, res) {
    var self = this;

    var cdbUser = req.context.user;

    var namedMapProvider;
    step(
        function reqParams() {
            self.app.req2params(req, this);
        },
        function getTile() {
            namedMapProvider = new NamedMapMapConfigProvider(
                self.templateMaps,
                self.pgConnection,
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                req.params
            );
            self.tileBackend.getTile(namedMapProvider, req.params, this);
        },
        function handleImage(err, tile, headers, stats) {
            if (req.profiler) {
                req.profiler.add(stats);
            }
            if (err) {
                if (!err.error) {
                    err.error = err.message;
                }
                self.app.sendError(res, err, self.app.findStatusCode(err), 'NAMED_MAP_TILE', err);
            } else {
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbUser, namedMapProvider.getTemplateName()));
                res.setHeader('Content-Type', headers['Content-Type']);
                res.setHeader('Cache-Control', 'public,max-age=7200,must-revalidate');
                self.app.sendResponse(res, [tile, 200]);
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
            self.app.req2params(req, this);
        },
        function getTemplate(err) {
            assert.ifError(err);
            namedMapProvider = new NamedMapMapConfigProvider(
                self.templateMaps,
                self.pgConnection,
                cdbUser,
                req.params.template_id,
                req.query.config,
                req.query.auth_token,
                req.params
            );
            namedMapProvider.getTemplate(this);
        },
        function prepareStaticImageOptions(err, template) {
            assert.ifError(err);
            getStaticImageOptions(template, this);
        },
        function estimateBounds(err, imageOpts) {
            assert.ifError(err);
            if (imageOpts) {
                return imageOpts;
            }

            var defaultZoomCenter = {
                zoom: 1,
                center: {
                    lng: 0,
                    lat: 0
                }
            };

            var cacheChannel = '';

            var dbTables = cacheChannel.split(':');
            if (dbTables.length <= 1 || dbTables[1].length === 0) {
                return defaultZoomCenter;
            }

            var tableNames = dbTables[1].split(',');
            if (tableNames.length === 0) {
                return defaultZoomCenter;
            }

            var next = this;
            self.tablesExtentApi.getBounds(cdbUser, tableNames, function(err, result) {
                next(null, result || defaultZoomCenter);
            });
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
        function handleImage(err, image, headers, stats) {
            if (req.profiler) {
                req.profiler.done('render-' + format);
                req.profiler.add(stats || {});
            }

            if (err) {
                if (!err.error) {
                    err.error = err.message;
                }
                self.app.sendError(res, err, self.app.findStatusCode(err), 'STATIC_VIZ_MAP', err);
            } else {
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbUser, namedMapProvider.getTemplateName()));
                res.setHeader('Content-Type', headers['Content-Type'] || 'image/' + format);
                res.setHeader('Cache-Control', 'public,max-age=7200,must-revalidate');
                self.app.sendResponse(res, [image, 200]);
            }
        }
    );
};


// Instantiate a template
NamedMapsController.prototype.instantiateTemplate = function(req, res, prepareParamsFn) {
    var self = this;

    var cdbuser = req.context.user;

    var mapConfigProvider;

    step(
        function getTemplateParams() {
            prepareParamsFn(this);
        },
        function getTemplate(err, templateParams) {
            assert.ifError(err);
            mapConfigProvider = new NamedMapMapConfigProvider(
                this.templateMaps,
                this.pgConnection,
                cdbuser,
                req.params.template_id,
                templateParams,
                req.query.auth_token,
                req.params
            );
            mapConfigProvider.getMapConfig(this);
        },
        function createLayergroup(err, mapConfig, rendererParams/*, context*/) {
            assert.ifError(err);
            self.mapBackend.createLayergroup(mapConfig, rendererParams, this);
        },
        function finishTemplateInstantiation(err, layergroup) {
            if (err) {
                var statusCode = this._app.findStatusCode(err);
                this.app.sendError(res, { errors: [ err.message ] }, statusCode, 'NAMED MAP LAYERGROUP', err);
            } else {
                var templateHash = self.templateMaps.fingerPrint(mapConfigProvider.template).substring(0, 8);
                layergroup.layergroupid = cdbuser + '@' + templateHash + '@' + layergroup.layergroupid;

                res.header('X-Layergroup-Id', layergroup.layergroupid);
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, mapConfigProvider.getTemplateName()));

                this.app.sendResponse(res, [layergroup, 200]);
            }
        }
    );
};

function getStaticImageOptions(template, callback) {
    if (template.view) {
        var zoomCenter = templateZoomCenter(template.view);
        if (zoomCenter) {
            return callback(null, zoomCenter);
        }

        var bounds = templateBounds(template.view);
        if (bounds) {
            return callback(null, bounds);
        }
    }
    return callback(null, null);
}

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
            return !!view.bounds[prop];
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
