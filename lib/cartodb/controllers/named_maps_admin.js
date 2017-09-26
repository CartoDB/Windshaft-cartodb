var step = require('step');
var assert = require('assert');
var templateName = require('../backends/template_maps').templateName;

var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

class NamedMapsAdminController extends BaseController {
    constructor({authApi, templateMaps}) {
        super();

        this.authApi = authApi;
        this.templateMaps = templateMaps;
    }
}


module.exports = NamedMapsAdminController;

NamedMapsAdminController.prototype.register = function (router) {
    router.options('/:template_id', cors('Content-Type'));

    router.use(
        cors(),
        userMiddleware
    );

    router.post('/', this.create.bind(this));
    router.put('/:template_id', this.update.bind(this));
    router.get('/:template_id', this.retrieve.bind(this));
    router.delete('/:template_id', this.destroy.bind(this));
    router.get('/', this.list.bind(this));
};

NamedMapsAdminController.prototype.create = function(req, res, next) {
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
        finishFn(self, req, res, 'POST TEMPLATE', null, next)
    );
};

NamedMapsAdminController.prototype.update = function(req, res, next) {
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
        finishFn(self, req, res, 'PUT TEMPLATE', null, next)
    );
};

NamedMapsAdminController.prototype.retrieve = function(req, res, next) {
    var self = this;

    req.profiler.start('windshaft-cartodb.get_template');

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
        finishFn(self, req, res, 'GET TEMPLATE', null, next)
    );
};

NamedMapsAdminController.prototype.destroy = function(req, res, next) {
    var self = this;

    req.profiler.start('windshaft-cartodb.delete_template');

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
            return '';
        },
        finishFn(self, req, res, 'DELETE TEMPLATE', 204, next)
    );
};

NamedMapsAdminController.prototype.list = function(req, res, next) {
    var self = this;
    req.profiler.start('windshaft-cartodb.get_template_list');

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
        finishFn(self, req, res, 'GET TEMPLATE LIST', null, next)
    );
};

function finishFn(controller, req, res, description, status, next) {
    return function finish(err, response){
        if (err) {
            err.label = description;
            next(err);
        } else {
            controller.send(req, res, response, status || 200);
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
