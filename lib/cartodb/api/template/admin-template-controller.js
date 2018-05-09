const { templateName } = require('../../backends/template_maps');
const credentials = require('../middlewares/credentials');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

/**
 * @param {AuthBackend} authBackend
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @constructor
 */
function AdminTemplateController(authBackend, templateMaps, userLimitsBackend) {
    this.authBackend = authBackend;
    this.templateMaps = templateMaps;
    this.userLimitsBackend = userLimitsBackend;
}

module.exports = AdminTemplateController;

AdminTemplateController.prototype.register = function (templateRouter) {
    templateRouter.options(`/:template_id`);

    templateRouter.post(
        `/`,
        credentials(),
        authorizedByAPIKey({ authBackend: this.authBackend, action: 'create', label: 'POST TEMPLATE' }),
        rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_CREATE),
        checkContentType({ action: 'POST', label: 'POST TEMPLATE' }),
        createTemplate({ templateMaps: this.templateMaps })
    );

    templateRouter.put(
        `/:template_id`,
        credentials(),
        authorizedByAPIKey({ authBackend: this.authBackend, action: 'update', label: 'PUT TEMPLATE' }),
        rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_UPDATE),
        checkContentType({ action: 'PUT', label: 'PUT TEMPLATE' }),
        updateTemplate({ templateMaps: this.templateMaps })
    );

    templateRouter.get(
        `/:template_id`,
        credentials(),
        authorizedByAPIKey({ authBackend: this.authBackend, action: 'get', label: 'GET TEMPLATE' }),
        rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_GET),
        retrieveTemplate({ templateMaps: this.templateMaps })
    );

    templateRouter.delete(
        `/:template_id`,
        credentials(),
        authorizedByAPIKey({ authBackend: this.authBackend, action: 'delete', label: 'DELETE TEMPLATE' }),
        rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_DELETE),
        destroyTemplate({ templateMaps: this.templateMaps })
    );

    templateRouter.get(
        `/`,
        credentials(),
        authorizedByAPIKey({ authBackend: this.authBackend, action: 'list', label: 'GET TEMPLATE LIST' }),
        rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_LIST),
        listTemplates({ templateMaps: this.templateMaps })
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

function authorizedByAPIKey ({ authBackend, action, label }) {
    return function authorizedByAPIKeyMiddleware (req, res, next) {
        const { user } = res.locals;

        authBackend.authorizedByAPIKey(user, res, (err, authenticated, apikey) => {
            if (err) {
                return next(err);
            }

            if (!authenticated) {
                const error = new Error(`Only authenticated user can ${action} templated maps`);
                error.http_status = 403;
                error.label = label;
                return next(error);
            }

            if (apikey.type !== 'master') {
                const error = new Error('Forbidden');
                error.type = 'auth';
                error.subtype = 'api-key-does-not-grant-access';
                error.http_status = 403;

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

            res.statusCode = 200;
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

            res.statusCode = 200;
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

            res.statusCode = 200;
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

            res.statusCode = 200;
            res.body = { template_ids: templateIds };

            next();
        });
    };
}
