var step = require('step');
var assert = require('assert');
var templateName = require('../template_maps').templateName;
var CdbRequest = require('../models/cdb_request');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');
var _ = require('underscore');

function NamedStaticMapsController(app, serverOptions, templateMaps, staticMapBackend, surrogateKeysCache,
                                   tablesExtentApi) {
    this.app = app;
    this.serverOptions = serverOptions;
    this.templateMaps = templateMaps;
    this.staticMapBackend = staticMapBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.tablesExtentApi = tablesExtentApi;
}

module.exports = NamedStaticMapsController;

var cdbRequest = new CdbRequest();

NamedStaticMapsController.prototype.register = function(app) {
    app.get(app.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format', this.named.bind(this));
};

NamedStaticMapsController.prototype.named = function(req, res) {
    var self = this;

    this.app.doCORS(res);
    var cdbUser = cdbRequest.userByReq(req);

    var template;
    var layergroupConfig;
    var layergroupId;
    var fakeReq;
    var cacheChannel;

    step(
        function reqParams() {
            self.app.req2params(req, this);
        },
        function getTemplate(err) {
            assert.ifError(err);
            self.templateMaps.getTemplate(cdbUser, templateName(req.params.template_id), this);
        },
        function checkExists(err, tpl) {
            assert.ifError(err);
            if (!tpl) {
                var notFoundErr = new Error(
                        "Template '" + templateName(req.params.template_id) + "' of user '" + cdbUser + "' not found"
                );
                notFoundErr.http_status = 404;
                throw notFoundErr;
            }
            return tpl;
        },
        function checkAuthorized(err, tpl) {
            assert.ifError(err);

            var authorized = false;
            try {
                authorized = self.templateMaps.isAuthorized(tpl, req.query.auth_token);
            } catch (err) {
                // we catch to add http_status
                var authorizationFailedErr = new Error('Failed to authorize template');
                authorizationFailedErr.http_status = 403;
                throw authorizationFailedErr;
            }
            if ( ! authorized ) {
                var unauthorizedErr = new Error('Unauthorized template instantiation');
                unauthorizedErr.http_status = 403;
                throw unauthorizedErr;
            }

            return tpl;
        },
        function prepareParams(err, tpl) {
            assert.ifError(err);

            template = tpl;

            var templateParams = {};
            if (req.query.config) {
                try {
                    templateParams = JSON.parse(req.query.config);
                } catch (e) {
                    throw new Error('malformed config parameter, should be a valid JSON');
                }
            }

            return templateParams;
        },
        function instantiateTemplate(err, templateParams) {
            assert.ifError(err);
            return self.templateMaps.instance(template, templateParams);
        },
        function prepareLayergroup(err, layergroup) {
            assert.ifError(err);
            layergroupConfig = layergroup;
            fakeReq = {
                query: {},
                params: {
                    user: req.params.user
                },
                headers: _.clone(req.headers),
                context: _.clone(req.context),
                method: req.method,
                res: res,
                profiler: req.profiler
            };
            self.serverOptions.setDBParams(cdbUser, fakeReq.params, this);
        },
        function setApiKey(err){
            assert.ifError(err);
            self.app.createLayergroup(layergroupConfig, fakeReq, this);
        },
        function prepareResponse(err, layergroup) {
            assert.ifError(err);

            // added by createLayergroup
            cacheChannel = res.header('X-Cache-Channel');
            res.removeHeader('X-Cache-Channel');
            self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbUser, template.name));

            layergroupId = layergroup.layergroupid.split(":")[0];

            return null;
        },
        function staticImageOptions(err) {
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

            var staticImageReq = {
                headers: _.clone(req.headers),
                params: _.extend(_.clone(fakeReq.params), {
                    token: layergroupId,
                    format: 'png'
                })
            };

            var width = +req.params.width;
            var height = +req.params.height;

            if (!_.isUndefined(imageOpts.zoom) && imageOpts.center) {
                self.staticMapBackend.getImage(staticImageReq, width, height, imageOpts.zoom, imageOpts.center, this);
            } else {
                self.staticMapBackend.getImage(staticImageReq, width, height, imageOpts.bounds, this);
            }
        },
        function handleImage(err, image, headers/*, stats*/) {
            if (err) {
                if (!err.error) {
                    err.error = err.message;
                }
                self.app.sendError(res, err, self.app.findStatusCode(err), 'STATIC_VIZ_MAP', err);
            } else {
                self.app.sendWithHeaders(res, image, 200, headers);
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
