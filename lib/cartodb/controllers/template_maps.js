var Step = require('step');
var _ = require('underscore');

function TemplateMapsController(app, serverOptions, templateMaps, signedMaps, metadataBackend, templateBaseUrl) {
    this.app = app;
    this.serverOptions = serverOptions;
    this.templateMaps = templateMaps;
    this.signedMaps = signedMaps;
    this.metadataBackend = metadataBackend;
    this.templateBaseUrl = templateBaseUrl;
}

module.exports = TemplateMapsController;


TemplateMapsController.prototype.register = function(app) {
    app.get(this.templateBaseUrl + '/:template_id/jsonp', this.jsonp.bind(this));
    app.post(this.templateBaseUrl, this.create.bind(this));
    app.put(this.templateBaseUrl + '/:template_id', this.update.bind(this));
    app.get(this.templateBaseUrl + '/:template_id', this.retrieve.bind(this));
    app.del(this.templateBaseUrl + '/:template_id', this.destroy.bind(this));
    app.get(this.templateBaseUrl, this.list.bind(this));
};

// Add a template
TemplateMapsController.prototype.create = function(req, res) {
    var self = this;

    this.app.doCORS(res);

    var cdbuser = self.app.userByReq(req);

    Step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function addTemplate(err, authenticated) {
            if ( err ) throw err;
            if (authenticated !== 1) {
                err = new Error("Only authenticated user can create templated maps");
                err.http_status = 403;
                throw err;
            }
            if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json' )
                throw new Error('template POST data must be of type application/json');
            var cfg = req.body;
            self.templateMaps.addTemplate(cdbuser, cfg, this);
        },
        function prepareResponse(err, tpl_id){
            if ( err ) throw err;
            // NOTE: might omit "cdbuser" if == dbowner ...
            return { template_id: cdbuser + '@' + tpl_id };
        },
        function finish(err, response){
            if ( req.profiler ) {
                res.header('X-Tiler-Profiler', req.profiler.toJSONString());
            }
            if (err){
                response = { error: ''+err };
                var statusCode = 400;
                if ( ! _.isUndefined(err.http_status) ) {
                    statusCode = err.http_status;
                }
                self.app.sendError(res, response, statusCode, 'POST TEMPLATE', err);
            } else {
                self.app.sendResponse(res, [response, 200]);
            }
        }
    );
};

// Update a template
TemplateMapsController.prototype.update = function(req, res) {
    var self = this;

    this.app.doCORS(res);

    var cdbuser = this.app.userByReq(req);
    var template;
    var tpl_id;
    Step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            if ( err ) throw err;
            if (authenticated !== 1) {
                err = new Error("Only authenticated user can list templated maps");
                err.http_status = 403;
                throw err;
            }
            if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json' )
                throw new Error('template PUT data must be of type application/json');
            template = req.body;
            tpl_id = req.params.template_id.split('@');
            if ( tpl_id.length > 1 ) {
                if ( tpl_id[0] != cdbuser ) {
                    err = new Error("Invalid template id '"
                        + req.params.template_id + "' for user '" + cdbuser + "'");
                    err.http_status = 404;
                    throw err;
                }
                tpl_id = tpl_id[1];
            }
            self.templateMaps.updTemplate(cdbuser, tpl_id, template, this);
        },
        function prepareResponse(err){
            if ( err ) throw err;
            return { template_id: cdbuser + '@' + tpl_id };
        },
        function finish(err, response){
            if ( req.profiler ) {
                res.header('X-Tiler-Profiler', req.profiler.toJSONString());
            }
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                    statusCode = err.http_status;
                }
                self.app.sendError(res, response, statusCode, 'PUT TEMPLATE', err);
            } else {
                self.app.sendResponse(res, [response, 200]);
            }
        }
    );
};

// Get a specific template
TemplateMapsController.prototype.retrieve = function(req, res) {
    var self = this;

    if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.get_template');
    }

    this.app.doCORS(res);

    var cdbuser = this.app.userByReq(req);
    var template;
    var tpl_id;
    Step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            if ( err ) throw err;
            if (authenticated !== 1) {
                err = new Error("Only authenticated users can get template maps");
                err.http_status = 403;
                throw err;
            }
            tpl_id = req.params.template_id.split('@');
            if ( tpl_id.length > 1 ) {
                if ( tpl_id[0] != cdbuser ) {
                    var err = new Error("Cannot get template id '"
                        + req.params.template_id + "' for user '" + cdbuser + "'");
                    err.http_status = 404;
                    throw err;
                }
                tpl_id = tpl_id[1];
            }
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val){
            if ( err ) throw err;
            if ( ! tpl_val ) {
                err = new Error("Cannot find template '" + tpl_id + "' of user '" + cdbuser + "'");
                err.http_status = 404;
                throw err;
            }
            // auth_id was added by ourselves,
            // so we remove it before returning to the user
            delete tpl_val.auth_id;
            return { template: tpl_val };
        },
        function finish(err, response){
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                    statusCode = err.http_status;
                }
                self.app.sendError(res, response, statusCode, 'GET TEMPLATE', err);
            } else {
                self.app.sendResponse(res, [response, 200]);
            }
        }
    );
};

// Delete a specific template
TemplateMapsController.prototype.destroy = function(req, res) {
    var self = this;

    if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.delete_template');
    }
    this.app.doCORS(res);

    var cdbuser = this.app.userByReq(req);
    var template;
    var tpl_id;
    Step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            if ( err ) throw err;
            if (authenticated !== 1) {
                err = new Error("Only authenticated users can delete template maps");
                err.http_status = 403;
                throw err;
            }
            tpl_id = req.params.template_id.split('@');
            if ( tpl_id.length > 1 ) {
                if ( tpl_id[0] != cdbuser ) {
                    var err = new Error("Cannot find template id '"
                        + req.params.template_id + "' for user '" + cdbuser + "'");
                    err.http_status = 404;
                    throw err;
                }
                tpl_id = tpl_id[1];
            }
            self.templateMaps.delTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val){
            if ( err ) throw err;
            return { status: 'ok' };
        },
        function finish(err, response){
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                    statusCode = err.http_status;
                }
                self.app.sendError(res, response, statusCode, 'DELETE TEMPLATE', err);
            } else {
                self.app.sendResponse(res, ['', 204]);
            }
        }
    );
};

// Get a list of owned templates
TemplateMapsController.prototype.list = function(req, res) {
    var self = this;

    if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.get_template_list');
    }
    this.app.doCORS(res);

    var cdbuser = this.app.userByReq(req);

    Step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function listTemplates(err, authenticated) {
            if ( err ) throw err;
            if (authenticated !== 1) {
                err = new Error("Only authenticated user can list templated maps");
                err.http_status = 403;
                throw err;
            }
            self.templateMaps.listTemplates(cdbuser, this);
        },
        function prepareResponse(err, tpl_ids){
            if ( err ) throw err;
            // NOTE: might omit "cbduser" if == dbowner ...
            var ids = _.map(tpl_ids, function(id) { return cdbuser + '@' + id; });
            return { template_ids: ids };
        },
        function finish(err, response){
            var statusCode = 200;
            if (err){
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                    statusCode = err.http_status;
                }
                self.app.sendError(res, response, statusCode, 'GET TEMPLATE LIST', err);
            } else {
                self.app.sendResponse(res, [response, statusCode]);
            }
        }
    );
};

/**
 * jsonp endpoint, allows to instantiate a template with a json call.
 * callback query argument is mandatory
 */
TemplateMapsController.prototype.jsonp = function(req, res) {
    var self = this;

    if ( req.profiler && req.profiler.statsd_client) {
        req.profiler.start('windshaft-cartodb.instance_template_get');
    }
    Step(
        function() {
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
        }, function(err, response) {
            self.finish_instantiation(err, response, res, req);
        }
    );
};


// Instantiate a template
TemplateMapsController.prototype.instantiateTemplate = function(req, res, template_params, callback) {
    var self = this;

    this.app.doCORS(res);

    var response = {};
    var template;
    var layergroup;
    var fakereq; // used for call to createLayergroup
    var cdbuser = self.app.userByReq(req);
    // Format of template_id: [<template_owner>]@<template_id>
    var tpl_id = req.params.template_id.split('@');
    if ( tpl_id.length > 1 ) {
        if ( tpl_id[0] && tpl_id[0] != cdbuser ) {
            var err = new Error('Cannot instanciate map of user "'
                + tpl_id[0] + '" on database of user "'
                + cdbuser + '"');
            err.http_status = 403;
            callback(err);
            return;
        }
        tpl_id = tpl_id[1];
    }
    var auth_token = req.query.auth_token;
    Step(
        function getTemplate(){
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function checkAuthorized(err, data) {
            if ( req.profiler ) req.profiler.done('getTemplate');
            if ( err ) throw err;
            if ( ! data ) {
                err = new Error("Template '" + tpl_id + "' of user '" + cdbuser + "' not found");
                err.http_status = 404;
                throw err;
            }
            template = data;
            var cert = self.templateMaps.getTemplateCertificate(template);
            var authorized = false;
            try {
                // authorizedByCert will throw if unauthorized
                authorized = self.signedMaps.authorizedByCert(cert, auth_token);
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
            /*if ( (! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json') && req.query.callback === undefined) {
             throw new Error('template POST data must be of type application/json, it is instead ');
             }*/
            //var template_params = req.body;
            if ( req.profiler ) req.profiler.done('authorizedByCert');
            return self.templateMaps.instance(template, template_params);
        },
        function prepareParams(err, instance){
            if ( req.profiler ) req.profiler.done('TemplateMaps_instance');
            if ( err ) throw err;
            layergroup = instance;
            fakereq = { query: {}, params: {}, headers: _.clone(req.headers),
                method: req.method,
                res: res,
                profiler: req.profiler
            };
            self.app.setDBParams(cdbuser, fakereq.params, this);
        },
        function setApiKey(err){
            if ( req.profiler ) req.profiler.done('setDBParams');
            if ( err ) throw err;
            self.metadataBackend.getUserMapKey(cdbuser, this);
        },
        function createLayergroup(err, val) {
            if ( req.profiler ) req.profiler.done('getUserMapKey');
            if ( err ) throw err;
            fakereq.params.api_key = val;
            self.app.createLayergroup(layergroup, fakereq, this);
        },
        function signLayergroup(err, resp) {
            // NOTE: createLayergroup uses profiler.start()/end() internally
            //if ( req.profiler ) req.profiler.done('createLayergroup');
            if ( err ) throw err;
            response = resp;
            var signer = cdbuser;
            var map_id = response.layergroupid.split(':')[0]; // dropping last_updated
            var crt_id = template.auth_id; // check ?
            if ( ! crt_id ) {
                var errmsg = "Template '" + tpl_id + "' of user '" + cdbuser + "' has no signature";
                // Is this really illegal ?
                // Maybe we could just return an unsigned layergroupid
                // in this case...
                err = new Error(errmsg);
                err.http_status = 403; // Forbidden, we refuse to respond to this
                throw err;
            }
            self.signedMaps.signMap(signer, map_id, crt_id, this);
        },
        function prepareResponse(err) {
            if ( req.profiler ) req.profiler.done('signMap');
            if ( err ) throw err;
            //console.log("Response from createLayergroup: "); console.dir(response);
            // Add the signature part to the token!
            var tplhash = self.templateMaps.fingerPrint(template).substring(0,8);
            if ( req.profiler ) req.profiler.done('fingerPrint');
            response.layergroupid = cdbuser + '@' + tplhash + '@' + response.layergroupid;
            return response;
        },
        callback
    );
};

TemplateMapsController.prototype.finish_instantiation = function(err, response, res, req) {
    if ( req.profiler ) {
        res.header('X-Tiler-Profiler', req.profiler.toJSONString());
    }
    if (err) {
        var statusCode = 400;
        response = { error: ''+err };
        if ( ! _.isUndefined(err.http_status) ) {
            statusCode = err.http_status;
        }
        if(global.environment.debug) {
            response.stack = err.stack;
        }
        this.app.sendError(res, response, statusCode, 'POST INSTANCE TEMPLATE', err);
    } else {
        this.app.sendResponse(res, [response, 200]);
    }
};
