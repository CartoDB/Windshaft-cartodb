'use strict';

module.exports = function customProfile () {
    return function customProfileMiddleware (req, res, next) {
        const __layergroup_id = res.get('X-Layergroup-Id') || res.locals._layergroupid;

        if (__layergroup_id) {
            req.profiler.add({ __layergroup_id });
        }

        next();
    };
};
