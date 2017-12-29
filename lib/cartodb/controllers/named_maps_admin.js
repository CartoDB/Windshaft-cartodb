var step = require('step');
var assert = require('assert');
var templateName = require('../backends/template_maps').templateName;

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');


/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @constructor
 */
function NamedMapsAdminController(authApi, templateMaps) {
    this.authApi = authApi;
    this.templateMaps = templateMaps;
}

module.exports = NamedMapsAdminController;

NamedMapsAdminController.prototype.register = function (app) {
    app.post(
        app.base_url_templated + '/',
        cors(),
        userMiddleware,
        this.checkContentType('POST', 'POST TEMPLATE'),
        this.authorizedByAPIKey('create', 'POST TEMPLATE'),
        this.create.bind(this)
    );

    app.put(
        app.base_url_templated + '/:template_id',
        cors(),
        userMiddleware,
        this.checkContentType('PUT', 'PUT TEMPLATE'),
        this.authorizedByAPIKey('update', 'PUT TEMPLATE'),
        this.update.bind(this)
    );

    app.get(
        app.base_url_templated + '/:template_id',
        cors(),
        userMiddleware,
        this.authorizedByAPIKey('get', 'GET TEMPLATE'),
        this.retrieve.bind(this)
    );

    app.delete(
        app.base_url_templated + '/:template_id',
        cors(),
        userMiddleware,
        this.authorizedByAPIKey('delete', 'DELETE TEMPLATE'),
        this.destroy.bind(this)
    );

    app.get(
        app.base_url_templated + '/',
        cors(),
        userMiddleware,
        this.authorizedByAPIKey('list', 'GET TEMPLATE LIST'),
        this.list.bind(this)
    );

    app.options(
        app.base_url_templated + '/:template_id',
        cors('Content-Type')
    );
};

NamedMapsAdminController.prototype.create = function(req, res, next) {
    var self = this;

    var cdbuser = res.locals.user;

    step(
        function addTemplate() {
            var cfg = req.body;
            self.templateMaps.addTemplate(cdbuser, cfg, this);
        },
        function prepareResponse(err, tpl_id){
            assert.ifError(err);

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: tpl_id });
        }
    );
};

NamedMapsAdminController.prototype.update = function(req, res, next) {
    var self = this;

    var cdbuser = res.locals.user;
    var template;
    var tpl_id;

    step(
        function updateTemplate() {
            template = req.body;
            tpl_id = templateName(req.params.template_id);
            self.templateMaps.updTemplate(cdbuser, tpl_id, template, this);
        },
        function prepareResponse(err){
            assert.ifError(err);

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: tpl_id });
        }
    );
};

NamedMapsAdminController.prototype.retrieve = function(req, res, next) {
    var self = this;

    req.profiler.start('windshaft-cartodb.get_template');

    var cdbuser = res.locals.user;
    var tpl_id;
    step(
        function getTemplate() {
            tpl_id = templateName(req.params.template_id);
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val) {
            assert.ifError(err);
            if ( ! tpl_val ) {
                const error = new Error(`Cannot find template '${tpl_id}' of user '${cdbuser}'`);
                error.http_status = 404;
                return next(error);
            }
            // auth_id was added by ourselves,
            // so we remove it before returning to the user
            delete tpl_val.auth_id;

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template: tpl_val });
        }
    );
};

NamedMapsAdminController.prototype.destroy = function(req, res, next) {
    var self = this;

    req.profiler.start('windshaft-cartodb.delete_template');

    var cdbuser = res.locals.user;
    var tpl_id;
    step(
        function deleteTemplate() {
            tpl_id = templateName(req.params.template_id);
            self.templateMaps.delTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err/*, tpl_val*/){
            assert.ifError(err);

            res.status(204);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]('');
        }
    );
};

NamedMapsAdminController.prototype.list = function(req, res, next) {
    var self = this;
    req.profiler.start('windshaft-cartodb.get_template_list');

    var cdbuser = res.locals.user;

    step(
        function listTemplates() {
            self.templateMaps.listTemplates(cdbuser, this);
        },
        function prepareResponse(err, tpl_ids){
            assert.ifError(err);

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_ids: tpl_ids });
        }
    );
};

NamedMapsAdminController.prototype.authorizedByAPIKey = function (action, label) {
    return function authorizedByAPIKeyMiddleware (req, res, next) {
        const { user } = res.locals;

        this.authApi.authorizedByAPIKey(user, req, (err, authenticated) => {
            if (err) {
                return next(err);
            }

            if (!authenticated) {
                const error = new Error(`Only authenticated user can ${action} templated maps`);
                error.http_status = 403;
                error.label = label;
                return next(error);
            }

            next();
        });
    }.bind(this);
};

NamedMapsAdminController.prototype.checkContentType = function (action, label) {
    return function checkContentTypeMiddleware (req, res, next) {
        if (!req.is('application/json')) {
            const error = new Error(`template ${action} data must be of type application/json`);
            error.label = label;
            return next(error);
        }
        next();
    };
};
