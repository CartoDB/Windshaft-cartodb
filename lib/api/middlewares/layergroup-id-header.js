'use strict';

module.exports = function setLayergroupIdHeader (templateMaps, useTemplateHash) {
    return function setLayergroupIdHeaderMiddleware (req, res, next) {
        const { user, template } = res.locals;
        const layergroup = res.body;

        if (useTemplateHash) {
            const templateHash = templateMaps.fingerPrint(template).substring(0, 8);
            layergroup.layergroupid = `${user}@${templateHash}@${layergroup.layergroupid}`;
            res.locals.templateHash = templateHash;
        }

        res.set('X-Layergroup-Id', layergroup.layergroupid);

        next();
    };
};
