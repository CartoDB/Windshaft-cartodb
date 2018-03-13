const { templateName } = require('../backends/template_maps');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');
const localsMiddleware = require('../middleware/context/locals');
const credentialsMiddleware = require('../middleware/context/credentials');

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
    const { base_url_templated } = app;

    app.post(
        `${base_url_templated}/`,
        cors(),
        userMiddleware(),
        localsMiddleware(),
        credentialsMiddleware(),
        checkContentType('POST', 'POST TEMPLATE'),
        authorizedByAPIKey(this.authApi, 'create', 'POST TEMPLATE'),
        create(this.templateMaps)
    );

    app.put(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        localsMiddleware(),
        credentialsMiddleware(),
        checkContentType('PUT', 'PUT TEMPLATE'),
        authorizedByAPIKey(this.authApi, 'update', 'PUT TEMPLATE'),
        update(this.templateMaps)
    );

    app.get(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        localsMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey(this.authApi, 'get', 'GET TEMPLATE'),
        retrieve(this.templateMaps)
    );

    app.delete(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        localsMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey(this.authApi, 'delete', 'DELETE TEMPLATE'),
        destroy(this.templateMaps)
    );

    app.get(
        `${base_url_templated}/`,
        cors(),
        userMiddleware(),
        localsMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey(this.authApi, 'list', 'GET TEMPLATE LIST'),
        list(this.templateMaps)
    );

    app.options(
        `${base_url_templated}/:template_id`,
        cors('Content-Type')
    );
};

function checkContentType (action, label) {
    return function checkContentTypeMiddleware (req, res, next) {
        if (!req.is('application/json')) {
            const error = new Error(`template ${action} data must be of type application/json`);
            error.label = label;
            return next(error);
        }
        next();
    };
}

function authorizedByAPIKey (authApi, action, label) {
    return function authorizedByAPIKeyMiddleware (req, res, next) {
        const { user } = res.locals;

        authApi.authorizedByAPIKey(user, res, (err, authenticated) => {
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
    };
}

function create (templateMaps) {
    return function createTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;

        templateMaps.addTemplate(user, template, (err, templateId) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: templateId });
        });
    };
}

function update (templateMaps) {
    return function updateTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;
        const templateId = templateName(req.params.template_id);

        templateMaps.updTemplate(user, templateId, template, (err) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: templateId });
        });
    };
}

function retrieve (templateMaps) {
    return function retrieveTemplateMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.get_template');

        const { user } = res.locals;
        const templateId = templateName(req.params.template_id);

        templateMaps.getTemplate(user, templateId, (err, template) => {
            if (err) {
                return next(err);
            }

            if (!template) {
                const error = new Error(`Cannot find template '${templateId}' of user '${user}'`);
                error.http_status = 404;
                return next(error);
            }
            // auth_id was added by ourselves,
            // so we remove it before returning to the user
            delete template.auth_id;

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template });
        });
    };
}

function destroy (templateMaps) {
    return function destroyTemplateMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.delete_template');

        const { user } = res.locals;
        const templateId = templateName(req.params.template_id);

        templateMaps.delTemplate(user, templateId, (err/* , tpl_val */) => {
            if (err) {
                return next(err);
            }

            res.status(204);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]('');
        });
    };
}

function list (templateMaps) {
    return function listTemplatesMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.get_template_list');

        const { user } = res.locals;

        templateMaps.listTemplates(user, (err, templateIds) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_ids: templateIds });
        });
    };
}
