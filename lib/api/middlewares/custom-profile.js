'use strict';

const layergroupToken = require('../../models/layergroup-token');

module.exports = function customProfile () {
    return function customProfileMiddleware (req, res, next) {
        if (res.locals.token && res.locals.cache_buster) {
            const { token: layergroupid, cache_buster: cachebuster } = res.locals;
            req.profiler.add({ layergroupid, cachebuster });
        } else if (res.get('X-Layergroup-Id')) {
            const { token: layergroupid, cacheBuster: cachebuster } = layergroupToken.parse(res.get('X-Layergroup-Id'));
            req.profiler.add({ layergroupid, cachebuster });
        }

        next();
    };
};
