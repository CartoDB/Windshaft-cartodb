const { templateName } = require('../backends/template_maps');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');

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

NamedMapsAdminController.prototype.create = function(req, res, next) {
    const cdbuser = res.locals.user;
    const cfg = req.body;

    this.templateMaps.addTemplate(cdbuser, cfg, (err, tpl_id) => {
        if (err) {
            return next(err);
        }

        res.status(200);

        const method = req.query.callback ? 'jsonp' : 'json';
        res[method]({ template_id: tpl_id });
    });
};

NamedMapsAdminController.prototype.update = function(req, res, next) {
    const cdbuser = res.locals.user;
    const template = req.body;
    const tpl_id = templateName(req.params.template_id);

    this.templateMaps.updTemplate(cdbuser, tpl_id, template, (err) => {
        if (err) {
            return next(err);
        }

        res.status(200);

        const method = req.query.callback ? 'jsonp' : 'json';
        res[method]({ template_id: tpl_id });
    });
};

NamedMapsAdminController.prototype.retrieve = function(req, res, next) {
    req.profiler.start('windshaft-cartodb.get_template');

    const cdbuser = res.locals.user;
    const tpl_id = templateName(req.params.template_id);

    this.templateMaps.getTemplate(cdbuser, tpl_id, (err, tpl_val) => {
        if (err) {
            return next(err);
        }

        if (!tpl_val) {
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
    });
};

NamedMapsAdminController.prototype.destroy = function(req, res, next) {
    req.profiler.start('windshaft-cartodb.delete_template');

    const cdbuser = res.locals.user;
    const tpl_id = templateName(req.params.template_id);

    this.templateMaps.delTemplate(cdbuser, tpl_id, (err/*, tpl_val*/) => {
        if (err) {
            return next(err);
        }

        res.status(204);

        const method = req.query.callback ? 'jsonp' : 'json';
        res[method]('');
    });
};

NamedMapsAdminController.prototype.list = function(req, res, next) {
    req.profiler.start('windshaft-cartodb.get_template_list');

    const cdbuser = res.locals.user;

    this.templateMaps.listTemplates(cdbuser, (err, tpl_ids) => {
        if (err) {
            return next(err);
        }

        res.status(200);

        const method = req.query.callback ? 'jsonp' : 'json';
        res[method]({ template_ids: tpl_ids });
    });
};
