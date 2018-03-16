const { templateName } = require('../backends/template_maps');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');
const localsMiddleware = require('../middleware/locals');
const credentialsMiddleware = require('../middleware/credentials');

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
    const { base_url_templated: templateBasePath } = app;

    app.post(
        `${templateBasePath}/`,
        cors(),
        localsMiddleware(),
        userMiddleware(),
        credentialsMiddleware(),
        checkContentType({ action: 'POST', label: 'POST TEMPLATE' }),
        authorizedByAPIKey({ authApi: this.authApi, action: 'create', label: 'POST TEMPLATE' }),
        createTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    app.put(
        `${templateBasePath}/:template_id`,
        cors(),
        localsMiddleware(),
        userMiddleware(),
        credentialsMiddleware(),
        checkContentType({ action: 'PUT', label: 'PUT TEMPLATE' }),
        authorizedByAPIKey({ authApi: this.authApi, action: 'update', label: 'PUT TEMPLATE' }),
        updateTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    app.get(
        `${templateBasePath}/:template_id`,
        cors(),
        localsMiddleware(),
        userMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'get', label: 'GET TEMPLATE' }),
        retrieveTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    app.delete(
        `${templateBasePath}/:template_id`,
        cors(),
        localsMiddleware(),
        userMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'delete', label: 'DELETE TEMPLATE' }),
        destroyTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    app.get(
        `${templateBasePath}/`,
        cors(),
        localsMiddleware(),
        userMiddleware(),
        credentialsMiddleware(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'list', label: 'GET TEMPLATE LIST' }),
        listTemplates({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    app.options(
        `${templateBasePath}/:template_id`,
        cors('Content-Type')
    );
};

function checkContentType ({ action, label }) {
    return function checkContentTypeMiddleware (req, res, next) {
        if (!req.is('application/json')) {
            const error = new Error(`template ${action} data must be of type application/json`);
            error.label = label;
            return next(error);
        }

        next();
    };
}

function authorizedByAPIKey ({ authApi, action, label }) {
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

function createTemplate ({ templateMaps }) {
    return function createTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;

        templateMaps.addTemplate(user, template, (err, templateId) => {
            if (err) {
                return next(err);
            }

            res.body = { template_id: templateId };

            next();
        });
    };
}

function updateTemplate ({ templateMaps }) {
    return function updateTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;
        const templateId = templateName(req.params.template_id);

        templateMaps.updTemplate(user, templateId, template, (err) => {
            if (err) {
                return next(err);
            }

            res.body = { template_id: templateId };

            next();
        });
    };
}

function retrieveTemplate ({ templateMaps }) {
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

            res.body = { template };

            next();
        });
    };
}

function destroyTemplate ({ templateMaps }) {
    return function destroyTemplateMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.delete_template');

        const { user } = res.locals;
        const templateId = templateName(req.params.template_id);

        templateMaps.delTemplate(user, templateId, (err/* , tpl_val */) => {
            if (err) {
                return next(err);
            }

            res.statusCode = 204;
            res.body = '';

            next();
        });
    };
}

function listTemplates ({ templateMaps }) {
    return function listTemplatesMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.get_template_list');

        const { user } = res.locals;

        templateMaps.listTemplates(user, (err, templateIds) => {
            if (err) {
                return next(err);
            }

            res.body = { template_ids: templateIds };

            next();
        });
    };
}

function sendResponse () {
    return function sendResponseMiddleware (req, res) {
        res.status(res.statusCode || 200);

        const method = req.query.callback ? 'jsonp' : 'json';
        res[method](res.body);
    };
}
