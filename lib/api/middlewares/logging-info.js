'use strict';

module.exports = function loggingInfo () {
    // add to logs basic information about the request
    // like: map config id
    return function loggingInfoMiddleware (req, res, next) {
        const info = {
            mapConfigId: getMapconfigId(res.locals),
            templateId: res.locals.templateId
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
