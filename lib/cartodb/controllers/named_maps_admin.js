const { templateName } = require('../backends/template_maps');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const localsMiddleware = require('../middleware/context/locals');
const credentialsMiddleware = require('../middleware/context/credentials');

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

NamedMapsAdminController.prototype.register = function (app) {
    const { base_url_templated } = app;

    app.post(
        `${base_url_templated}/`,
        cors(),
        userMiddleware(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_CREATE),
        localsMiddleware(),
        credentialsMiddleware(),
        this.checkContentType('POST', 'POST TEMPLATE'),
        this.authorizedByAPIKey('create', 'POST TEMPLATE'),
        this.create()
    );

    app.put(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_UPDATE),
        localsMiddleware(),
        credentialsMiddleware(),
        this.checkContentType('PUT', 'PUT TEMPLATE'),
        this.authorizedByAPIKey('update', 'PUT TEMPLATE'),
        this.update()
    );

    app.get(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_GET),
        localsMiddleware(),
        credentialsMiddleware(),
        this.authorizedByAPIKey('get', 'GET TEMPLATE'),
        this.retrieve()
    );

    app.delete(
        `${base_url_templated}/:template_id`,
        cors(),
        userMiddleware(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_DELETE),
        localsMiddleware(),
        credentialsMiddleware(),
        this.authorizedByAPIKey('delete', 'DELETE TEMPLATE'),
        this.destroy()
    );

    app.get(
        `${base_url_templated}/`,
        cors(),
        userMiddleware(),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.NAMED_LIST),
        localsMiddleware(),
        credentialsMiddleware(),
        this.authorizedByAPIKey('list', 'GET TEMPLATE LIST'),
        this.list()
    );

    app.options(
        `${base_url_templated}/:template_id`,
        cors('Content-Type')
    );
};

NamedMapsAdminController.prototype.authorizedByAPIKey = function (action, label) {
    return function authorizedByAPIKeyMiddleware (req, res, next) {
        const { user } = res.locals;
        this.authApi.authorizedByAPIKey(user, res, (err, authenticated) => {
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

NamedMapsAdminController.prototype.create = function () {
    return function createTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;

        this.templateMaps.addTemplate(user, template, (err, templateId) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: templateId });
        });
    }.bind(this);
};

NamedMapsAdminController.prototype.update = function () {
    return function updateTemplateMiddleware (req, res, next) {
        const { user } = res.locals;
        const template = req.body;
        const templateId = templateName(req.params.template_id);

        this.templateMaps.updTemplate(user, templateId, template, (err) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_id: templateId });
        });
    }.bind(this);
};

NamedMapsAdminController.prototype.retrieve =  function () {
    return function retrieveTemplateMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.get_template');

        const { user } = res.locals;
        const templateId = templateName(req.params.template_id);

        this.templateMaps.getTemplate(user, templateId, (err, template) => {
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
    }.bind(this);
};

NamedMapsAdminController.prototype.destroy = function () {
    return function destroyTemplateMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.delete_template');

        const { user } = res.locals;
        const templateId = templateName(req.params.template_id);

        this.templateMaps.delTemplate(user, templateId, (err/* , tpl_val */) => {
            if (err) {
                return next(err);
            }

            res.status(204);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]('');
        });
    }.bind(this);
};

NamedMapsAdminController.prototype.list = function () {
    return function listTemplatesMiddleware (req, res, next) {
        req.profiler.start('windshaft-cartodb.get_template_list');

        const { user } = res.locals;

        this.templateMaps.listTemplates(user, (err, templateIds) => {
            if (err) {
                return next(err);
            }

            res.status(200);

            const method = req.query.callback ? 'jsonp' : 'json';
            res[method]({ template_ids: templateIds });
        });
    }.bind(this);
};
