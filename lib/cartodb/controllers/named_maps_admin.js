var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var templateName = require('../backends/template_maps').templateName;
var cors = require('../middleware/cors');


/**
 * @param app
 * @param {TemplateMaps} templateMaps
 * @param {AuthApi} authApi
 * @constructor
 */
function NamedMapsAdminController(app, templateMaps, authApi) {
    this.app = app;
    this.templateMaps = templateMaps;
    this.authApi = authApi;
}

module.exports = NamedMapsAdminController;

NamedMapsAdminController.prototype.register = function(app) {
    app.post(app.base_url_templated, cors(), this.create.bind(this));
    app.put(app.base_url_templated + '/:template_id', cors(), this.update.bind(this));
    app.get(app.base_url_templated + '/:template_id', cors(), this.retrieve.bind(this));
    app.del(app.base_url_templated + '/:template_id', cors(), this.destroy.bind(this));
    app.get(app.base_url_templated, cors(), this.list.bind(this));
    app.options(app.base_url_templated + '/:template_id', cors('Content-Type'));
};

NamedMapsAdminController.prototype.create = function(req, res) {
    var self = this;

    var cdbuser = req.context.user;

    step(
        function checkPerms(){
            self.authApi.authorizedByAPIKey(cdbuser, req, this);
        },
        function addTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can get template maps');
            ifInvalidContentType(req, 'template POST data must be of type application/json');
            var cfg = req.body;
            self.templateMaps.addTemplate(cdbuser, cfg, this);
        },
        function prepareResponse(err, tpl_id){
            assert.ifError(err);
            return { template_id: tpl_id };
        },
        finishFn(self.app, res, 'POST TEMPLATE')
    );
};

NamedMapsAdminController.prototype.update = function(req, res) {
    var self = this;

    var cdbuser = req.context.user;
    var template;
    var tpl_id;
    step(
        function checkPerms(){
            self.authApi.authorizedByAPIKey(cdbuser, req, this);
        },
        function updateTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated user can update templated maps');
            ifInvalidContentType(req, 'template PUT data must be of type application/json');

            template = req.body;
            tpl_id = templateName(req.params.template_id);
            self.templateMaps.updTemplate(cdbuser, tpl_id, template, this);
        },
        function prepareResponse(err){
            assert.ifError(err);

            return { template_id: tpl_id };
        },
        finishFn(self.app, res, 'PUT TEMPLATE')
    );
};

NamedMapsAdminController.prototype.retrieve = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.get_template');
    }

    var cdbuser = req.context.user;
    var tpl_id;
    step(
        function checkPerms(){
            self.authApi.authorizedByAPIKey(cdbuser, req, this);
        },
        function getTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can get template maps');

            tpl_id = templateName(req.params.template_id);
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val) {
            assert.ifError(err);
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
        finishFn(self.app, res, 'GET TEMPLATE')
    );
};

NamedMapsAdminController.prototype.destroy = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.delete_template');
    }

    var cdbuser = req.context.user;
    var tpl_id;
    step(
        function checkPerms(){
            self.authApi.authorizedByAPIKey(cdbuser, req, this);
        },
        function deleteTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can delete template maps');

            tpl_id = templateName(req.params.template_id);
            self.templateMaps.delTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err/*, tpl_val*/){
            assert.ifError(err);
            return { status: 'ok' };
        },
        finishFn(self.app, res, 'DELETE TEMPLATE', ['', 204])
    );
};

NamedMapsAdminController.prototype.list = function(req, res) {
    var self = this;
    if ( req.profiler ) {
        req.profiler.start('windshaft-cartodb.get_template_list');
    }

    var cdbuser = req.context.user;

    step(
        function checkPerms(){
            self.authApi.authorizedByAPIKey(cdbuser, req, this);
        },
        function listTemplates(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated user can list templated maps');

            self.templateMaps.listTemplates(cdbuser, this);
        },
        function prepareResponse(err, tpl_ids){
            assert.ifError(err);
            return { template_ids: tpl_ids };
        },
        finishFn(self.app, res, 'GET TEMPLATE LIST')
    );
};

function finishFn(app, res, description, okResponse) {
    return function finish(err, response){
        var statusCode = 200;
        if (err) {
            statusCode = 400;
            response = { errors: ['' + err] };
            if ( ! _.isUndefined(err.http_status) ) {
                statusCode = err.http_status;
            }
            res.sendError(res, response, statusCode, description, err);
        } else {
            res.sendResponse(res, okResponse || [response, statusCode]);
        }
    };
}

function ifUnauthenticated(authenticated, description) {
    if (!authenticated) {
        var err = new Error(description);
        err.http_status = 403;
        throw err;
    }
}

function ifInvalidContentType(req, description) {
    if (!req.is('application/json')) {
        throw new Error(description);
    }
}
