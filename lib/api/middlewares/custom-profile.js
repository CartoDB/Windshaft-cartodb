'use strict';

module.exports = function customProfile () {
    return function customProfileMiddleware (req, res, next) {
        const layergroupid = res.get('X-Layergroup-Id') || res.locals._layergroupid;

        if (layergroupid) {
            req.profiler.add({ layergroupid });
        }

        next();
    };
};
