'use strict';

module.exports = function customProfile () {
    return function customProfileMiddleware (req, res, next) {
        const layergroupid = res.get('X-Layergroup-Id') || req.params.token;

        if (layergroupid) {
            req.profiler.add({ layergroupid });
        }

        next();
    };
};
