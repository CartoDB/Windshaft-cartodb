'use strict';

const { templateName } = require('../../backends/template-maps');

module.exports = function setTilerInfoHeader() {
    // add basic information about the request to logs
    return function setTilerInfoHeaderMiddleware(req, res, next) {
        const info = {
            mapConfigId: getMapconfigId(res.locals),
            templateId: getTemplateId(req.params, res.body)
        };

        res.set('X-Tiler-Info', JSON.stringify(info));

        next();
    };
};

function getMapconfigId(locals) {
    if (locals.token) {
        return locals.token;
    }

    if (locals.mapConfig) {
        return locals.mapConfig._id;
    }
}

function getTemplateId(params, body) {
    if (params.template_id) {
        return templateName(params.template_id);
    }

    if (body.template_id) {
        return body.template_id;
    }
}
