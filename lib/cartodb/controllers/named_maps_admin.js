const { templateName } = require('../backends/template_maps');
const cors = require('../middleware/cors');
const credentials = require('../middleware/credentials');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const sendResponse = require('../middleware/send-response');

/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @constructor
 */
function NamedMapsAdminController(authApi, templateMaps, userLimitsApi) {
    this.authApi = authApi;
    this.templateMaps = templateMaps;
    this.userLimitsApi = userLimitsApi;
}

module.exports = NamedMapsAdminController;

NamedMapsAdminController.prototype.register = function (templateRouter) {
    templateRouter.post(
        `/`,
        credentials(),
        checkContentType({ action: 'POST', label: 'POST TEMPLATE' }),
        authorizedByAPIKey({ authApi: this.authApi, action: 'create', label: 'POST TEMPLATE' }),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_CREATE),
        createTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    templateRouter.put(
        `/:template_id`,
        credentials(),
        checkContentType({ action: 'PUT', label: 'PUT TEMPLATE' }),
        authorizedByAPIKey({ authApi: this.authApi, action: 'update', label: 'PUT TEMPLATE' }),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_UPDATE),
        updateTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    templateRouter.get(
        `/:template_id`,
        credentials(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'get', label: 'GET TEMPLATE' }),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_GET),
        retrieveTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    templateRouter.delete(
        `/:template_id`,
        credentials(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'delete', label: 'DELETE TEMPLATE' }),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_DELETE),
        destroyTemplate({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    templateRouter.get(
        `/`,
        credentials(),
        authorizedByAPIKey({ authApi: this.authApi, action: 'list', label: 'GET TEMPLATE LIST' }),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_LIST),
        listTemplates({ templateMaps: this.templateMaps }),
        sendResponse()
    );

    templateRouter.options(`/:template_id`, cors('Content-Type'));
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
