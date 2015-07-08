var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var templateName = require('../backends/template_maps').templateName;
var CdbRequest = require('../models/cdb_request');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

function NamedMapsController(app, templateMaps, metadataBackend, mapBackend, templateBaseUrl, surrogateKeysCache,
                             layergroupRequestDecorator) {
    this.app = app;
    this.templateMaps = templateMaps;
    this.metadataBackend = metadataBackend;
    this.mapBackend = mapBackend;
    this.templateBaseUrl = templateBaseUrl;
    this.surrogateKeysCache = surrogateKeysCache;
    this.layergroupRequestDecorator = layergroupRequestDecorator;
}

module.exports = NamedMapsController;

var cdbRequest = new CdbRequest();

NamedMapsController.prototype.register = function(app) {
    app.get(this.templateBaseUrl + '/:template_id/:layer/:z/:x/:y.:format', this.tile.bind(this));
    app.get(this.templateBaseUrl + '/:template_id/jsonp', this.jsonp.bind(this));
    app.options(this.templateBaseUrl + '/:template_id', this.options.bind(this));
    app.post(this.templateBaseUrl + '/:template_id', this.instantiate.bind(this));
};

NamedMapsController.prototype.tile = function(req, res) {
    var self = this;

    this.app.doCORS(res);

    var cdbUser = cdbRequest.userByReq(req);
    var template;
    var layergroupConfig;
    var layergroupId;
    var params;
    var cacheChannel;

    var layergroupDecorator = {
        beforeLayergroupCreate: function(requestMapConfig, callback) {
            self.layergroupRequestDecorator.beforeLayergroupCreate(req, requestMapConfig, callback);
        },
        afterLayergroupCreate: function(layergroup, response, callback) {
            self.layergroupRequestDecorator.afterLayergroupCreate(req, layergroup, response, callback);
        }
    };

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
            params = _.extend({}, req.params, {
                user: req.params.user
            });
            self.app.setDBParams(cdbUser, params, this);
        },
        function setApiKey(err){
            assert.ifError(err);
            self.mapBackend.createLayergroup(layergroupConfig, params, layergroupDecorator, this);
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
        function getImage(err) {
            assert.ifError(err);

            req.params.token = layergroupId;
            self.mapBackend.getTileOrGrid(req.params, this);
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
                res.setHeader('Content-Type', headers['Content-Type']);
                res.setHeader('Cache-Control', 'public,max-age=7200,must-revalidate');
                self.app.sendResponse(res, [tile, 200]);
            }
        }
    );
};

NamedMapsController.prototype.instantiate = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_post');
    }
    step(
        function instantiateTemplate() {
            ifInvalidContentType(req, 'template POST data must be of type application/json');

            self.instantiateTemplate(req, res, req.body, this);
        }, function finishInstantiation(err, response) {
            self.finish_instantiation(err, response, res);
        }
    );
};

NamedMapsController.prototype.options = function(req, res, next) {
    this.app.doCORS(res, "Content-Type");
    return next();
};

/**
 * jsonp endpoint, allows to instantiate a template with a json call.
 * callback query argument is mandatory
 */
NamedMapsController.prototype.jsonp = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_get');
    }
    step(
        function jsonp$instantiateTemplate() {
            if ( req.query.callback === undefined || req.query.callback.length === 0) {
                throw new Error('callback parameter should be present and be a function name');
            }
            var config = {};
            if(req.query.config) {
                try {
                    config = JSON.parse(req.query.config);
                } catch(e) {
                    throw new Error('badformed config parameter, should be a valid JSON');
                }
            }
            self.instantiateTemplate(req, res, config, this);
        }, function finishInstantiation(err, response) {
            self.finish_instantiation(err, response, res);
        }
    );
};


// Instantiate a template
NamedMapsController.prototype.instantiateTemplate = function(req, res, template_params, callback) {
    var self = this;

    this.app.doCORS(res);

    var layergroupDecorator = {
        beforeLayergroupCreate: function(requestMapConfig, callback) {
            self.layergroupRequestDecorator.beforeLayergroupCreate(req, requestMapConfig, callback);
        },
        afterLayergroupCreate: function(layergroup, response, callback) {
            self.layergroupRequestDecorator.afterLayergroupCreate(req, layergroup, response, callback);
        }
    };

    var template;
    var layergroup;
    var cdbuser = cdbRequest.userByReq(req);
    var params = {
        user: req.params.user
    };
    // Format of template_id: [<template_owner>]@<template_id>
    var tpl_id = templateName(req.params.template_id);
    var auth_token = req.query.auth_token;
    step(
        function getTemplate(){
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function checkAuthorized(err, templateValue) {
            if ( req.profiler ) req.profiler.done('getTemplate');
            if ( err ) throw err;
            if ( ! templateValue ) {
                err = new Error("Template '" + tpl_id + "' of user '" + cdbuser + "' not found");
                err.http_status = 404;
                throw err;
            }

            template = templateValue;

            var authorized = false;
            try {
                authorized = self.templateMaps.isAuthorized(template, auth_token);
            } catch (err) {
                // we catch to add http_status
                err.http_status = 403;
                throw err;
            }
            if ( ! authorized ) {
                err = new Error('Unauthorized template instanciation');
                err.http_status = 403;
                throw err;
            }

            if (req.profiler) {
                req.profiler.done('authorizedByCert');
            }

            return self.templateMaps.instance(template, template_params);
        },
        function prepareParams(err, instance){
            if ( req.profiler ) req.profiler.done('TemplateMaps_instance');
            if ( err ) throw err;
            layergroup = instance;
            self.app.setDBParams(cdbuser, params, this);
        },
        function setApiKey(err){
            if ( req.profiler ) req.profiler.done('setDBParams');
            if ( err ) throw err;
            self.metadataBackend.getUserMapKey(cdbuser, this);
        },
        function createLayergroup(err, val) {
            if ( req.profiler ) req.profiler.done('getUserMapKey');
            if ( err ) throw err;
            params.api_key = val;
            self.mapBackend.createLayergroup(layergroup, params, layergroupDecorator, this);
        },
        function prepareResponse(err, layergroup) {
            if ( err ) {
                return callback(err, { errors: [''+err] });
            }
            var tplhash = self.templateMaps.fingerPrint(template).substring(0,8);
            layergroup.layergroupid = cdbuser + '@' + tplhash + '@' + layergroup.layergroupid;
            res.header('X-Layergroup-Id', layergroup.layergroupid);

            self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, template.name));

            callback(null, layergroup);
        }
    );
};

NamedMapsController.prototype.finish_instantiation = function(err, response, res) {
    if (err) {
        var statusCode = 400;
        response = { errors: [''+err] };
        if ( ! _.isUndefined(err.http_status) ) {
            statusCode = err.http_status;
        }
        this.app.sendError(res, response, statusCode, 'POST INSTANCE TEMPLATE', err);
    } else {
        this.app.sendResponse(res, [response, 200]);
    }
};

function ifInvalidContentType(req, description) {
    if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json' ) {
        throw new Error(description);
    }
}
